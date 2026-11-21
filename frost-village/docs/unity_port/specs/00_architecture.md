# 00 · Architecture and build plan — Unity 6.3 LTS vertical slice of 「행복한 눈꽃마을 이야기」

Target: Unity 6.3 LTS (6000.3.x), URP 2D Renderer, C# 9, Windows PC editor, Android phone (portrait).
Project: `D:\Work\Snowbloom\SnowbloomUnity` (its own git repo). Phaser reference clone: `D:\Work\Snowbloom\nurient`
(read-only, used for art, data export and side-by-side comparison).
Reader: the C# engineer (human or Claude on the Windows PC) who builds the slice. Specs 01–07 hold the behaviour;
this document decides how they fit together, in what order they are built, and how each step is checked.

Verification codes used below: **D** = `dotnet test` on Core (no Unity, also runs in GitHub Actions), **E** = Unity
batchmode EditMode tests, **P** = Unity batchmode PlayMode tests (graphics on), **B** = batchmode build/execute method,
**H** = a human in the editor, **Ph** = a human (the designer) on the phone, **T** = replay of a Phaser trace captured
by WP-R (§8, A22).

Revision 2 (after the two critiques `crit_unity.md` and `crit_fidelity.md`): every accepted BLOCKER/MAJOR fix is
written into the sections below; §14 lists each critique item as applied or rejected, with the reason. Where this
document and specs 01–07 disagree, this document wins (the specs carry "SUPERSEDED" banners where it matters).

---

## 0. Decisions on one page

| # | Decision | Source / why |
|---|---|---|
| A1 | **All simulation is plain C# in `Snowbloom.Core`** (no UnityEngine): world px with y down, `double` maths, the whole tick in Phaser order. `Snowbloom.Game` only draws, plays sound and reads devices. | 01 D1, 04 C1/C6, 06 L1. It also lets the opening loop (incl. the first-sale bot, 06 A15) run headless with `dotnet test`. |
| A2 | One **variable-step tick per rendered frame**: `dt = min(0.05, smoothedDeltaMs/1000)`; game-time `Scheduler` (delayed calls, tweens, item flights) and `FramePlayer`s advance **before** the tick. No `FixedUpdate`, no coroutines on real time, `Time.timeScale = 1`. | 01 §5, 04 C8, 06 L2–L4 |
| A3 | **Draw order = exact per-frame rank** (spec 03 option P1): every world sort entry keeps `(double Depth, long Seq)`; a Core `RankList` keeps them sorted; `sortingOrder = rank − 32768` on the built-in **`Default`** sorting layer (no custom layer: none is needed with P1, and layers cannot be added from code). `SortingGroup` only where Phaser has one display-list entry with children (containers, pad stacks). Maths in §4.1. | 03 §9, closes 02 Q1 / 03 Q1 / 04 C5 |
| A4 | **1 unit = 64 px** (sprite PPU 64), orthographic camera, `orthographicSize = (H/2)/zoomCur/64`, no Pixel Perfect Camera, no pixel snapping. | 01 D2/D3, 05 D4 |
| A5 | **Gamma colour space for the slice** (parity with canvas sRGB blending), with a WP-0 gate: read whether 6000.3 marks Gamma deprecated for URP, run the self-test in Gamma **and** Linear, save both screenshots for the designer, record the decision in `CLAUDE.md`. Every alpha constant lives in one Core table `LookConstants` so a Linear retune is one file. Every sprite uses `Sprite-Unlit-Default`; no 2D lights, HDR off, post-processing off. | 02 §10, 05 R9, crit_unity 4 |
| A6 | **Ground** = meshes built once at load with world-anchored-UV HLSL shaders, **road masks and zone overlays baked offline** by an editor tool from `world_static.json`, thin strokes as generated meshes, stamps/decals as sprites. No Tilemap, no runtime re-bake, no 512-px tile pool. | 02 §6, §6.11 |
| A7 | **See-through** = CPU alpha fade of the whole picture (spec 03 §6) with offline-baked 4-px alpha masks. No shader. | 03 §6 (Phaser fades the sprite's alpha) |
| A8 | **Assets** = spec 05 option (a): the Phaser asset tree copied 1:1 into `Assets/_Snowbloom/Content/<frag>/`, an `AssetPostprocessor` for import settings, runtime `Sprite.Create` with trim-aware pivots, a catalog ScriptableObject; **Tier A + A+ + B** loaded while `Village.unity` loads (M1a), **Tier B+** added in M1b (§5.3); never unloaded. | 05 D1–D6 (path renamed from `Assets/FrostVillage/Art/`); crit_fidelity 2–4 |
| A9 | **Data** = `world.json`, `balance.json`, `strings.json` exported from the Phaser data modules by a Node script (they are pure data: no functions, no imports — checked), plus `world_static.json` (= spec 02 golden file) as the layout source of truth. | 01 R2, 02 §0, 06 §3.3 |
| A10 | **Font** = the font the Phaser game really shows on the designer's Android phone. The game ships no font file: the WebView falls back to the system font (Noto Sans CJK KR on Pixel/AOSP, Samsung's font on Galaxy; Latin/digits from Roboto). **Default: Noto Sans KR Bold + Black** (OFL) as TMP SDF, Roboto Bold as the Latin/digit primary if the phone screenshot shows Roboto digits; Pretendard is offered to the designer as a separate design choice. Decided in WP-0 from a screenshot of the Phaser HUD on the designer's phone, before WP-8. Dynamic multi-atlas **2048 × 4096**, sampling 64, **padding 13**, SDFAA, canvas strokes as material presets (§4.6), pre-warmed with every slice string. | 05 §11; crit_fidelity 7, crit_unity 3 |
| A11 | **Input** = Input System package + `EnhancedTouch`; touch events fed to the router **in time order** each frame; the pointer router, joystick, pinch and tap logic are Core classes (unit-tested); per-finger "over UI" by our own `GraphicRaycaster` raycast. | 01 §4; crit_unity 12–13 |
| A12 | **Tap-to-walk** = a **ground-tap mode** on top of the ported GoalWalk steering (01 §4.8): pad snap or `FreeSpot` target, quiet walk (no `g_walk`/`g_arrived`/`g_cancel` toasts), a fading target ring, re-tap re-targets, works during the tutorial (§6.1). Behind a settings toggle 「탭해서 걷기」, **on by default in the slice** (the designer's request); off = Phaser parity. Goal window LATER. | resolves 01 Q1 / 04 Q1 with a default; crit_fidelity 8; designer confirms |
| A13 | **Save** = the same JSON text as Phaser (07 S2), `FileKvStore` under `Application.persistentDataPath/kv/`; Newtonsoft `JObject` for **parsing only**; writing through our own `JsJsonWriter` = ECMA-262 `Number::toString` (`JsNumber.Format`, self-contained shortest-digits routine, never `ToString("R")`) + a JS-exact string escaper; old villages enter through the 마을 옮기기 code (decode, dry run, apply) and, in development builds, a fixture list. | 07; crit_unity 2 |
| A14 | Slice = **separate app id `com.snowbloom.village.slice`**, development builds signed with Unity's debug key. The Play upload key and `dist/` are never touched. | 07 Q1 |
| A15 | **One set of Core tests, two runners**: the same `.cs` files compile in Unity (EditMode) and in a standalone `net10.0` NUnit project (plus a compile-only `netstandard2.1` API check). Golden JSON from the specs and the WP-R traces (A22) are the oracles. Bit-exact results are promised for dotnet and the editor; on the IL2CPP device only through the integer-exact paths (§2.3). | 01 §10, 02 §16, 03 §13, 04 §21, 06 §19, 07 §12; crit_unity 8, 16, 17 |
| A16 | Not used in the slice: DOTween, Mecanim/Animator, NavMesh, Physics2D, Tilemap, Sprite Atlas, Addressables, Localization package, Shader Graph water. | 04 C2/C6, 05 D5, 06 L4 |
| A17 | Frame rate: `vSyncCount = 0`, `targetFrameRate` 60 (90 on a 90-Hz phone with the high preset, 30 on low), Optimized Frame Pacing on. | 01 D6, §5.3 |
| A18 | Phaser's **letterbox**: logical 720 × H, H = clamp(round(720·h/w), 1280, 1600), bars outside 9:16…9:20. | 01 §2, closes 01 Q3 (parity) |
| A19 | Android: IL2CPP, ARM64 only, min API = `max(24, lowest value the 6000.3 dropdown offers)`, target API = the highest platform the Hub's Android module installed (no licence prompt in batchmode), graphics APIs **`[OpenGLES3]` only** (predictable on old Mali; Vulkan measured once in WP-11), portrait only, internal write permission, `VIBRATE` permission (short haptics, §8 WP-8). | 01 §5–6, 07 R4/R10; crit_unity 15, 24 |
| A20 | Repos: `SnowbloomUnity` is a new git repo with LFS for binaries (the Korean plan's ★ choice 2); `nurient` is a shallow clone beside it and is never written to. | plan doc §2 |
| A21 | **Two milestones** (re-baselined schedule, §8.2): **M1a** = go/no-go items 1–5 (new game look, see-through, movement and camera, residents, opening loop, save/load of the slice's own saves) — about 5 weeks with two Claude sessions; **M1b** = item 6 (an existing v4.x save shows its village) — about 2 more weeks. The designer is told this in the first message; option B (one milestone with cuts) is listed in §8.2. | crit_fidelity 1 |
| A22 | **Machine-checkable Phaser references**: WP-R (day 1–2, cloud side, `tools/test/fv_step.mjs` fixed-step driver) captures `displaylist_newgame.json`, `trace_loop.json`, `trace_resident.json`; Core/PlayMode replays (**T**) are the oracles for WP-4, WP-6a and WP-8a. Spec tables stay as unit tests. | crit_fidelity 5, 16 |
| A23 | **Cast and crowd parity**: residents = exactly `WORLD.life.moveIns.start` (4 people + `pet_dog`, `JobPet` included); customers draw their look from `villager_a/b/c` **plus every loaded villager look** (Tier A+ = all `villagers*` atlases), as Phaser does a few seconds into a new game. | crit_fidelity 3–4 |

---

## 1. Folders, packages, git

### 1.1 Machine layout

```
D:\Work\Snowbloom\
  nurient\                       shallow clone of github.com/hyun800115-create/nurient (read-only)
    frost-village\assets\...     the art the slice copies (Tier A + A+ + B, B+ in M1b; §5.3, spec 05 §16)
    frost-village\src\data\*.js  world.js, balance.js, strings.js, items.js -> exported to JSON
    frost-village\tools\test\fixtures\*.json   33 save fixtures (spec 07 §12)
  SnowbloomUnity\                the Unity project = its own git repo (§1.2)
  SnowbloomUnity_ci\             optional git worktree of SnowbloomUnity for batchmode runs while the editor is open (§9.4)
  ci\                            logs, test results, APKs, phone screenshots (not in git)
```

### 1.2 Project layout

```
SnowbloomUnity/
  Assets/_Snowbloom/
    Content/<frag>/...           copy of nurient/frost-village/assets/<frag>/... (same relative paths; manifests unchanged)
    Data/                        world.json, balance.json, strings.json (exported), world_static.json (= spec 02 golden)
    Generated/                   produced by editor tools, committed:
      Ground/                    roads_start.png (+ roads_zone_<id>.png, roads_region_<id>.png)
      Occlusion/                 <atlasKey>.occ.bytes (x-ray masks)
      Catalog/FvAssetCatalog.asset
    Fonts/                       NotoSansKR-Bold.otf, NotoSansKR-Black.otf (+ Roboto-Bold.ttf if chosen), OFL texts,
                                 <font> SDF.asset + material presets per stroke style (§4.6), prewarm_chars.txt
                                 (Pretendard only if the designer picks it as a design choice)
    Shaders/                     SB_WorldUv.shader, SB_RoadComposite.shader, SB_ScrollTile.shader, SB_SpriteAdditive.shader
    Settings/                    URP-Slice.asset, Renderer2D-Slice.asset, Materials.asset (every material, referenced: no Shader.Find)
    Scenes/                      Boot.unity (reference-free), Village.unity (owns the catalog)
    Prefabs/                     Hud.prefab (canvas), minimal
    DevFixtures/                 v4202_25min.json, v43a3_fresh25.json, v4202_fresh_tut.json, v43a3_late.json (TextAssets, dev builds)
    Scripts/
      Core/                      Snowbloom.Core.asmdef   (pure C#, §2)
      Game/                      Snowbloom.Game.asmdef   (MonoBehaviours, views, platform)
      Editor/                    Snowbloom.Editor.asmdef (import, bake, CI, build)
    Tests/
      Core/                      Snowbloom.Core.Tests.asmdef (EditMode; same files compiled by DotnetTests)
      EditMode/                  Snowbloom.Game.Tests.EditMode.asmdef (imported assets, catalog)
      PlayMode/                  Snowbloom.Game.Tests.PlayMode.asmdef (boot, layout, screenshots, save round trip, trace replays)
  Assets/TextMesh Pro/           TMP Essential Resources (template/third-party, committed; includes its Resources/TMP Settings.asset)
  Assets/Settings/               URP global settings / default volume profile written by the template (left alone)
  Golden/                        (outside Assets: never imported) save_golden.json, save_code_v4202_25min.txt, routes_golden.json,
                                 pivots_golden.json, fixtures/*.json (the 33 from nurient), WP-R traces (A22)
  Packages/manifest.json, packages-lock.json
  ProjectSettings/
  DotnetTests/                   Snowbloom.Standalone.sln, Core/…Standalone.csproj, Tests/…Standalone.csproj,
                                 ApiCheck/…ApiCheck.csproj (§2.4)
  Tools/
    ci.ps1                       the batchmode wrapper (§9)
    export/export_data.mjs       Node 22: nurient data modules -> Assets/_Snowbloom/Data/*.json
    golden/                      generator scripts kept from the spec work (s07/*.mjs, c04/routes.mjs, s06/*.mjs, a05/*.py)
    slice_assets.txt             the Tier A + A+ + B (+ B+) file list (§5.3, spec 05 §16) + their manifests/atlas JSON + audio
  Docs/PortSpecs/                00–07 + 02_world_ground_static.json + 07 golden files (reference copies)
  Docs/Reference/                Phaser screenshots, video, timings captured on the cloud side (WP-R); outside Assets
  .github/workflows/core-tests.yml   dotnet test on ubuntu (no Unity licence needed)
  .gitignore, .gitattributes, README.md, CLAUDE.md
```

Rules: nothing **of ours** outside `Assets/_Snowbloom/` (allowed template/third-party folders: `Assets/TextMesh Pro/`
including its `Resources/`, which TMP loads with `Resources.Load("TMP Settings")`, and the template's
`Assets/Settings/`); no `Resources/` folder of ours (the catalog references assets); no `Assembly-CSharp` code (every
script lives in an asmdef). Delete the template's `Assets/InputSystem_Actions.inputactions` and sample scene (unused).
Golden files and reference shots live outside `Assets/` so Unity never imports them (both test runners read them from
disk).

### 1.3 Packages (`Packages/manifest.json`)

Create the project from Unity Hub's **Universal 2D** template (it writes the editor-locked core package versions and
the `com.unity.modules.*` list), then edit the manifest with a **delete list and an add list** — never by writing the
whole dependency list by hand:

| Action | Packages |
|---|---|
| Delete (if present) | `com.unity.2d.animation`, `com.unity.2d.psdimporter`, `com.unity.2d.aseprite`, `com.unity.2d.spriteshape`, `com.unity.2d.tilemap`, `com.unity.2d.tilemap.extras`, `com.unity.visualscripting`, `com.unity.timeline`, `com.unity.collab-proxy`, `com.unity.multiplayer.center` |
| Keep exactly as the template wrote them | URP (`17.3.x`), uGUI (`2.0.x`, contains TextMeshPro), Test Framework (whatever 6000.3 locks), the IDE packages, and **every `com.unity.modules.*` entry** (engine code stripping removes unused modules from the player anyway; deleting them only removes types we compile against, e.g. `particlesystem` for snowfall/dust, `screencapture`, `uielements`) |
| Add if missing | `com.unity.nuget.newtonsoft-json` (3.2.x; Json.NET 13.0.x, AOT-safe), `com.unity.2d.sprite`, `com.unity.inputsystem` (keep the template's version unless it is below 1.11; then take the newest verified 1.x the Package Manager offers) |

Version numbers in this document are examples, not values to type: the 6000.3 template decides the editor-locked
ones. `ProjectSetup` (WP-0) asserts that the delete list is gone and the add list present. Commit `packages-lock.json`
after WP-0.

### 1.4 `.gitignore`

```
/[Ll]ibrary/
/[Tt]emp/
/[Oo]bj/
/[Bb]uild/
/[Bb]uilds/
/[Ll]ogs/
/[Uu]ser[Ss]ettings/
/[Mm]emoryCaptures/
/[Rr]ecordings/
/*.csproj
/*.sln
/*.slnx
/.vs/
/.idea/
/DotnetTests/**/bin/
/DotnetTests/**/obj/
/TestResults/
*.apk
*.aab
*.symbols.zip
*.keystore
*.jks
*.p12
*.pidb.meta
*.pdb.meta
*.mdb.meta
sysinfo.txt
crashlytics-build.properties
```

(`/*.csproj` ignores only Unity's generated project files at the root; `DotnetTests/**/*.csproj` are ours and tracked.)

### 1.5 `.gitattributes` (LFS for binaries, Unity smart merge for YAML)

```
* text=auto
*.cs        text diff=csharp
*.shader    text
*.hlsl      text
*.json      text
*.asmdef    text
*.md        text
*.ps1       text eol=crlf
*.unity     text merge=unityyamlmerge eol=lf
*.prefab    text merge=unityyamlmerge eol=lf
*.asset     text merge=unityyamlmerge eol=lf
*.mat       text merge=unityyamlmerge eol=lf
*.meta      text merge=unityyamlmerge eol=lf
*.png       filter=lfs diff=lfs merge=lfs -text
*.jpg       filter=lfs diff=lfs merge=lfs -text
*.webp      filter=lfs diff=lfs merge=lfs -text
*.psd       filter=lfs diff=lfs merge=lfs -text
*.ogg       filter=lfs diff=lfs merge=lfs -text
*.mp3       filter=lfs diff=lfs merge=lfs -text
*.wav       filter=lfs diff=lfs merge=lfs -text
*.ttf       filter=lfs diff=lfs merge=lfs -text
*.otf       filter=lfs diff=lfs merge=lfs -text
*.bytes     binary
*.blend     filter=lfs diff=lfs merge=lfs -text
*.fbx       filter=lfs diff=lfs merge=lfs -text
Assets/_Snowbloom/Fonts/*.asset filter=lfs diff=lfs merge=lfs -text
```

One-time per clone (PowerShell, inside `SnowbloomUnity`):

```powershell
git lfs install
git config core.autocrlf false
git config merge.unityyamlmerge.name "Unity SmartMerge"
git config merge.unityyamlmerge.driver "'<UnityEditorDir>/Data/Tools/UnityYAMLMerge.exe' merge -p %O %B %A %A"
git config merge.unityyamlmerge.recursive binary
```

`<UnityEditorDir>` = the folder of the `Unity.exe` that `ci.ps1` resolves (§9.1: `$env:UNITY_EXE`, else the Hub's
install location from `%APPDATA%\UnityHub\secondaryInstallPath.json`, e.g. `D:\Unity\Hub\Editor\6000.3.x\Editor`, else
the default `C:\Program Files\Unity\Hub\Editor\…`). `ci.ps1 -Task setup` writes this git config line itself.

`*.bytes` (the x-ray masks, ≈ 1/16 bit per source pixel, well under 1 MB in all) stay out of LFS on purpose: the
GitHub Actions dotnet run reads them without fetching LFS objects.

Editor settings (ProjectSetup applies them, §8 WP-0): Asset Serialization = Force Text, Version Control = Visible
Meta Files (`VersionControlSettings.mode`), Parallel Import on. The TMP font asset stays **Dynamic** with "Clear
Dynamic Data on Build"; do not commit atlas growth from play mode (revert the asset). Slice binaries are small:
Tier A + B PNG 15.4 MB, Tier A+ villagers ≈ 17 MB, audio ≈ 2 MB, fonts ≈ 9 MB (two Noto Sans KR subsets).

---

## 2. Assemblies

### 2.1 Assembly graph

```
Snowbloom.Core  (noEngineReferences, netstandard2.1, C# 9)  <- Newtonsoft.Json.dll
   ^        ^                         ^
   |        |                         |
Snowbloom.Game (runtime)        Snowbloom.Core.Tests (EditMode; also compiled by DotnetTests)
   ^      ^
   |      |
Snowbloom.Editor (Editor only)   Snowbloom.Game.Tests.EditMode / .PlayMode
```

### 2.2 asmdef files

`Assets/_Snowbloom/Scripts/Core/Snowbloom.Core.asmdef`

```json
{
  "name": "Snowbloom.Core",
  "rootNamespace": "Snowbloom.Core",
  "references": [],
  "includePlatforms": [],
  "excludePlatforms": [],
  "allowUnsafeCode": false,
  "overrideReferences": true,
  "precompiledReferences": ["Newtonsoft.Json.dll"],
  "autoReferenced": false,
  "defineConstraints": [],
  "versionDefines": [],
  "noEngineReferences": true
}
```

`Assets/_Snowbloom/Scripts/Game/Snowbloom.Game.asmdef`

```json
{
  "name": "Snowbloom.Game",
  "rootNamespace": "Snowbloom.Game",
  "references": ["Snowbloom.Core", "Unity.InputSystem", "Unity.TextMeshPro", "UnityEngine.UI",
                 "Unity.RenderPipelines.Core.Runtime", "Unity.RenderPipelines.Universal.Runtime"],
  "overrideReferences": true,
  "precompiledReferences": ["Newtonsoft.Json.dll"],
  "autoReferenced": false,
  "noEngineReferences": false
}
```

`Assets/_Snowbloom/Scripts/Editor/Snowbloom.Editor.asmdef`

```json
{
  "name": "Snowbloom.Editor",
  "rootNamespace": "Snowbloom.EditorTools",
  "references": ["Snowbloom.Core", "Snowbloom.Game", "Unity.TextMeshPro",
                 "Unity.RenderPipelines.Core.Runtime", "Unity.RenderPipelines.Universal.Runtime"],
  "includePlatforms": ["Editor"],
  "overrideReferences": true,
  "precompiledReferences": ["Newtonsoft.Json.dll"],
  "autoReferenced": false
}
```

`Assets/_Snowbloom/Tests/Core/Snowbloom.Core.Tests.asmdef`

```json
{
  "name": "Snowbloom.Core.Tests",
  "references": ["Snowbloom.Core", "UnityEngine.TestRunner", "UnityEditor.TestRunner"],
  "includePlatforms": ["Editor"],
  "overrideReferences": true,
  "precompiledReferences": ["nunit.framework.dll", "Newtonsoft.Json.dll"],
  "autoReferenced": false,
  "defineConstraints": ["UNITY_INCLUDE_TESTS"]
}
```

`Snowbloom.Game.Tests.EditMode` = same shape + `Snowbloom.Game`, `Snowbloom.Editor` references.
`Snowbloom.Game.Tests.PlayMode` = same shape, `includePlatforms: []`, references `Snowbloom.Core`, `Snowbloom.Game`.

### 2.3 Rules for Core code

| Rule | Detail |
|---|---|
| No engine types | No `UnityEngine.*`, no `Vector2`; Core has `Vec2d` (double x, y), `RectD`, `Rgba` (byte). Enforced: the standalone dotnet build fails on any UnityEngine reference. |
| C# 9 in Unity | Records and `init` need `System.Runtime.CompilerServices.IsExternalInit`, missing in netstandard2.1: add `Core/Polyfill/IsExternalInit.cs` (`namespace System.Runtime.CompilerServices { internal static class IsExternalInit {} }`). Not available in Unity: covariant returns, module initializers, function pointers — do not use. No C# 10 (file-scoped namespaces, global usings). |
| API level | Player setting API Compatibility = **.NET Standard 2.1** on every platform, so Unity compiles Core against the same surface as the standalone `netstandard2.1` build. |
| Numbers | `double` for positions, timers, depths (06 R14, 03 §9.1, 04 R7); `long` for coins/tills; `int` for counts. JS rounding only via `JsMath.JsRound(v) = Math.Floor(v + 0.5)` (01 D9). |
| Double → integer | **Never** a bare `(int)`/`(long)` cast of a `double` (NaN/out-of-range casts differ: x64 gives `0x80000000…`, IL2CPP ARM64 saturates). JS `x \| 0`, `x >>> 0`, `~~x` → `JsMath.ToInt32(x)` / `JsMath.ToUint32(x)` (ECMA ToInt32: NaN/±∞ → 0, truncate, modulo 2^32); bounded counts → `JsMath.ClampToLong(x)`. `ci.ps1 -Task dotnet` runs a grep check that fails on `(int)`/`(long)` applied to a double expression outside `JsMath.cs` (allow-list comments for proven-integral cases). |
| Determinism | Goldens use exact equality only for results of `+ − × ÷ sqrt floor` and integer code (IEEE-exact everywhere). Anything through `Math.Sin/Cos/Atan2/Exp/Pow/Log` uses relative `Within(1e-9)` (or the spec's ±0.01 px); decision boundaries (`dirFromVec`, thresholds) are tested with inputs away from the exact boundary. Bit-exactness is promised for dotnet and the editor, not for the IL2CPP device (clang may contract `a*b+c` into FMA on ARM64). |
| Culture | `BootLoader.Awake` and the dotnet `[SetUpFixture]` set `CultureInfo.DefaultThreadCurrentCulture = CultureInfo.CurrentCulture = InvariantCulture`. Core always passes `CultureInfo.InvariantCulture`, uses `ToLowerInvariant`, `StringComparison.Ordinal` and `StringComparer.Ordinal` (JS sorts by UTF-16 code unit). One EditMode test runs the save writer under `tr-TR` and `de-DE`. |
| Iteration order | A JS object/`Map` that the code **iterates** (residents' think order, job picks, pad sync, `life.moved`, `progress.done`) is ported as `OrderedMap<K,V>` (Dictionary + linked list, stable under removal), never a bare `Dictionary`/`HashSet`. Test: remove + re-add a key, compare the iteration with Node's. |
| Randomness | `IRandom` per system (`System.Random` wrapper), seed injectable (04 C7, 06 L7); a `ConstRandom(0.5)` mode for the WP-R trace replays (A22); the border-forest RNG is `JsRng` (02 §7.4.1). |
| Logging | `ILog { Warn(string); WarnOnce(string key, string msg); }` implemented by `Debug.LogWarning` in Game and by `Console` in dotnet. |
| Allocation | No LINQ and no lambdas capturing per tick in the hot path (04 R10); pools for route lists, grid scratch arrays, stack items, bubbles, flights. |
| JSON | Parsing: Newtonsoft `JObject`/`JToken` with one shared `JsJson.Settings` (`DateParseHandling.None`, `FloatParseHandling.Double`); an out-of-range literal (`1e400`), which Unity's BCL rejects, is re-read as ±Infinity (pre-scan + retry), as JS does. Writing: our own `JsJsonWriter` (07 §2.3): `JsNumber.Format` = ECMA-262 `Number::toString` placement rules over a self-contained shortest-digits routine (Ryu/Grisu-style port, integer maths only); strings escape only `"`, `\`, U+0000–U+001F (JS short forms, lower-case `\u00xx`) and lone surrogates (`\udxxx`), leaving U+2028/2029/0085 raw. Never `ToString("R"/"G17"/"F0")`. |

### 2.4 Standalone dotnet projects (Core tests without Unity)

`DotnetTests/Core/Snowbloom.Core.Standalone.csproj`

```xml
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>netstandard2.1</TargetFramework>
    <LangVersion>9.0</LangVersion>
    <AssemblyName>Snowbloom.Core</AssemblyName>
    <RootNamespace>Snowbloom.Core</RootNamespace>
    <EnableDefaultCompileItems>false</EnableDefaultCompileItems>
    <Nullable>disable</Nullable>
  </PropertyGroup>
  <ItemGroup>
    <Compile Include="..\..\Assets\_Snowbloom\Scripts\Core\**\*.cs" />
    <PackageReference Include="Newtonsoft.Json" Version="13.0.3" />
  </ItemGroup>
</Project>
```

`DotnetTests/Tests/Snowbloom.Core.Tests.Standalone.csproj`

```xml
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net10.0</TargetFramework>
    <LangVersion>9.0</LangVersion>
    <AssemblyName>Snowbloom.Core.Tests</AssemblyName>   <!-- same name as the Unity test asmdef: InternalsVisibleTo works in both -->
    <IsPackable>false</IsPackable>
    <EnableDefaultCompileItems>false</EnableDefaultCompileItems>
  </PropertyGroup>
  <ItemGroup>
    <Compile Include="..\..\Assets\_Snowbloom\Tests\Core\**\*.cs" />
    <ProjectReference Include="..\Core\Snowbloom.Core.Standalone.csproj" />
    <PackageReference Include="NUnit" Version="3.14.0" />
    <PackageReference Include="NUnit3TestAdapter" Version="4.5.0" />
    <PackageReference Include="Microsoft.NET.Test.Sdk" Version="17.8.0" />
  </ItemGroup>
</Project>
```

`DotnetTests/ApiCheck/Snowbloom.Core.Tests.ApiCheck.csproj`: compile-only, `netstandard2.1`, `LangVersion 9.0`, the
same `<Compile Include>` as the test project, references the Core project and `NUnit 3.14.0`. It is in the solution,
so `dotnet build` fails when test code uses an API Unity lacks (`PriorityQueue`, `File.Move(a, b, true)`,
`Convert.ToHexString`, `Random.Shared` …).

Create the solution with `dotnet new sln --format sln -n Snowbloom.Standalone` (the .NET 10 SDK writes `.slnx` by
default; every reference here uses `.sln`).

Rules for test code (both runners): only the NUnit 3.5 surface that Unity's `com.unity.ext.nunit` provides
(`Assert.That`, `Is.EqualTo(..).Within(..)`, `[TestCase]`, `[TestCaseSource]`, `[SetUp]`); no `Assert.Multiple`, no async
tests, no `UnityEngine`; no records and no `init` in test code (Core's `IsExternalInit` polyfill would collide with the
BCL's copy through `InternalsVisibleTo`). Golden files are found by `Golden.Path(name)`: environment variable
`SNOWBLOOM_ROOT`, else walk up from `Environment.CurrentDirectory` and from `AppContext.BaseDirectory` to the first folder
containing `Assets/_Snowbloom`, then `<root>/Golden/<name>` (or `Assets/_Snowbloom/Data/<name>`). Unity's working
directory is the project root; dotnet's `bin/` walks up to it.

`.github/workflows/core-tests.yml`: `ubuntu-latest`, `actions/checkout` (current major; LFS off: Core tests need no
art), `actions/setup-dotnet` (current major) with `10.0.x`, `dotnet test DotnetTests/Snowbloom.Standalone.sln -c
Release`. Required check on pull requests from day one.

---

## 3. Runtime architecture

### 3.1 Core (simulation) vs Game (presentation)

```
            +--------------------------- Snowbloom.Core (pure C#) ---------------------------+
devices --> | InputCore/PointerRouter --> GameSim.Tick(dt, deltaMs, nowMs)                    |
(Game)      |    world: WorldBuilder, Territory, Collision, Roads/Paths                       |
            |    actors: PlayerSim, Customers, Residents/VillageLife, Clerk/Cook, Bubbles      |
            |    loop: FishingDeck, Station+OperatorSpot, Shop/Lane/Register/CashPad, Economy, |
            |          Progression/UnlockPad, Tutorial (+Onboarding)                          |
            |    render model: Depth constants, RankList(SortKey), Occlusion(OccMask), StackPlace|
            |    view model: CameraModel, ViewMetrics, FrameClock, PerfPresets                |
            |    save: SaveService, Migrate, Sanitize, Remap43, Transfer, GameSerializer       |
            +---------------------------------^---------------------------------------------+
                                              | reads state (pull), never writes sim state
            +------------------------ Snowbloom.Game (MonoBehaviours) -----------------------+
            | GameLoop, InputRouter, VillageCamera, WorldViews (+DepthSorter), Hud, Audio,   |
            | FvAssets (sprites), GroundBuilder, FileKvStore/SaveDriver, DeviceFacts, Debug    |
            +-------------------------------------------------------------------------------+
```

* Every Core entity exposes the Phaser-shaped state the views need (`X, Y, LiftY, Dir, AnimKey, FrameIndex, FlipX,
  Alpha, Visible, Depth`). Views read it in `LateUpdate` and write Transforms/renderers only when a value changed.
* Static props get one view each, created at build, with no `Update` method. Dynamic views are iterated by one
  `WorldViews.Sync()` call (no per-object `Update`).
* Camera maths lives in Core (`CameraModel`), so the sim can read `LastDrawnView` (tutorial framing, LOD, `Unseen`,
  occlusion, customer spawn points, 01 R20 / 03 R9 / 04 R14) in headless tests too. `VillageCamera` only copies the
  result to the Unity camera.
* Text width is never needed by the simulation; panel sizes are computed in Game from TMP `preferredWidth`.

### 3.2 Frame order (merges 01 §5.2, 04 §19, 06 §4)

```
GameLoop.Update            [DefaultExecutionOrder(-1000)]
  0  FrameClock.Step(Time.unscaledDeltaTime)  -> deltaMs (10-sample smoothing, 200 ms cap, focus rule), dt, nowMs += deltaMs
  1  InputRouter.Poll()     -> PointerRouter: this frame's touch/mouse events in TIME order (§6); wheel; keys (01 §4.3)
  2  Scheduler.Advance(deltaMs)   delayed calls, tweens, flights (their onDone runs here)        (06 §4)
  3  FramePlayers.Tick(deltaMs)   impacts fire here (Player.Impact, OperatorSpot.ChiefImpact)    (04 §4.5, §19.11)
  GameSim.Tick(dt, deltaMs, nowMs):
  4  vec = InputCore.Update(nowMs)
  5  roads.NewFrame(dt); walkClock += dt; sea/fog/floater clocks; territory.Update(dt)
  6  player.Update(dt, vec) -> Sync
  7  onPad = progression.Update(dt)            8  padT -= dt; onPad |= HandlePlayerPads(dt)
  9  onPad |= UpdateLabour(dt)                 10 playerOnPad = onPad
  11 deck.Update(dt)                           12 stations.Update(dt)
  13 shop.Update(dt)  (till, register, spawn, lane, customers' MoveAgent + Sync, leavers)
  14 life.Update(dt)  (residents, jobs, think every 0.5 s, bubbles)
  15 halo model; goalWalk.Update (its vector is consumed next tick); carry-pill model
  16 tutorial.Update(dt); onboarding.Update(dt) (WP-12)
  17 occlusion.Update(dt)  (uses LastDrawnView)
  18 camera.TickZoom(dt, deltaMs); camera.TickTarget(deltaMs, nowMs)
  19 snow emitter timer; ambience every 0.25 s; autosave timer (5 s) -> SaveDue
  Hud.Tick(dt): coin counter, coin flyers, toasts/banners, objective panel, edge arrow, joystick view
VillageCamera.LateUpdate   [DefaultExecutionOrder(0)]   clamp, worldView (= next frame's LastDrawnView), transform, orthographicSize
WorldViews.LateUpdate      [DefaultExecutionOrder(500)] sync dynamic views (WorldImage.Apply, CharacterView, StackView rebuilds)
DepthSorter.LateUpdate     [DefaultExecutionOrder(1000)] RankList.Settle -> write changed sortingOrders
SaveDriver                 SaveDue -> Save.Write; OnApplicationPause(true)/Focus(false)/Quit -> synchronous save
```

### 3.3 Scenes and start-up

* `Boot.unity` is **reference-free** (no catalog, no textures, no font asset beyond TMP's default): `BootLoader.Awake`
  sets the invariant culture, runs the WP-0 self-test in development builds, `Settings.Load`, preset pick, then
  `SceneManager.LoadSceneAsync("Village")` and drives its progress bar from `AsyncOperation.progress` (a scene that
  references the catalog loads every texture synchronously before its first frame, so the bar would never move).
* `Village.unity` owns the `FvAssetCatalog` reference: `GameLoop`, `World` camera, `Backdrop` camera (letterbox
  gradient, **enabled only when `ViewMetrics.OffX > 0 || OffY > 0`**, recomputed on resize), `EventSystem` with
  `InputSystemUIInputModule` (never `StandaloneInputModule`), `Hud` canvas with a loading overlay, `WorldRoot`.
  `GameLoop.Start`: `FvAssets.Init(catalog)` → `Finalize` (anims, generated textures) → TMP pre-warm
  (`prewarm_chars.txt`, spread over a few frames under the overlay) → `Save.Load()` → build the village (new game if
  `null`) in the 07 §10.1 order → hide the overlay. There is no title in the slice: an existing save continues;
  「처음부터」 is in the settings panel. Reload (after 마을 옮기기 or 처음부터) = `SceneManager.LoadScene("Boot")`.
* Static holders (`FvAssets`, sprite caches, `Materials`, settings) are reload-safe: `Init` is idempotent (second call
  is a no-op or a full reset), and each has a `Reset()` called from
  `[RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]`, so editor Play Mode with domain
  reload off never sees destroyed sprites. A PlayMode test boots twice in one session.
* `ProjectSetup` writes `EditorBuildSettings.scenes` = Boot, Village (otherwise `LoadScene("Boot")` fails in editor Play
  Mode and PlayMode tests).

### 3.4 Data files

| File | Made by | Read by |
|---|---|---|
| `Data/world.json` | `Tools/export/export_data.mjs` (`JSON.stringify(WORLD)`, 41 KB) | Core `WorldData` (stations, labour, market, deck, life, pads, plots, territory) |
| `Data/balance.json` | same (`BALANCE`, 13.5 KB) | Core `Balance` typed view (06 §3.3 numbers) |
| `Data/strings.json` | same (`STRINGS` ko/en; `LINES` later) | Core `Strings.T(key, params)`, `Fmt(n)`, `Josa` (ports of strings.js 1248–1281, 1431) |
| `Data/world_static.json` | spec 02 (Node, from world.js + generator copies) | Core `WorldStatic` (every fence, decor, tree, stamp, decal, plot, zone, road, fog piece at new game) |

The export script is the only bridge to the Phaser code: rerun it (and the golden generators) whenever the Phaser data
changes; the Core tests then show what moved. A ScriptableObject editor for balance numbers is LATER and wraps the same
JSON.

---

## 4. Rendering

### 4.1 Draw order — the decision, with the precision maths

Facts (03 §9.1, 01 §7, 02 §10):

| Quantity | Value |
|---|---|
| Phaser depth range in the slice | WATER −20000 … ARROW 45000 (TOP 50000 unused): span 65,000 (70,000 with TOP) |
| Smallest offsets used in the slice | 0.0005 (stack item index), 0.001 (stack base, pad stacks), 0.002 (chief line), 0.01 (deck rods), 1e-5 (deck fishers, after the fisher hire), 1e-6 (cutaways, LATER) |
| Exact ties that occur | every pad at PAD −12000, pad icons −11901, every shadow −11000, pad price coin + text 28900 |
| Unity order key | sortingLayer, then `sortingOrder` (int16: 65,536 values), then camera distance (float32), then undefined |
| float32 ulp | 2.4e-4 at 3450; 9.5e-7 at 10; 1.2e-7 at 1 |

Consequences:
* Any **fixed** map depth → int16 over one layer has ≥ 65,000/65,536 ≈ 1 depth unit per order: every sub-pixel offset
  (clerk +0.5, sign +0.2, deck layers +0.01…+0.6, labels) is lost.
* One layer per band with ×8 orders (02 §10) resolves 0.125: the 0.01–0.05 deck steps and every +0.001 still collapse,
  and their ties fall to camera distance.
* Putting the fraction in `z` (03 P2) depends on float32 camera distance (ulp 9.5e-7 with the camera 10 units away)
  and leaves exact ties undefined, so pads and shadows could flicker.
* The number of **live** sort entries is ≈ 500 at a new game and ≈ 2,500 in a late village, far below 65,536. Sorting
  them by `(double Depth, long Seq)` and writing the **rank** loses nothing: it is exact for every offset and every tie.

**Decision: exact rank (03 P1).**

```csharp
// Core/Render/SortKey.cs, RankList.cs
public sealed class SortKey { public double Depth; public long Seq; public int Rank = -1; internal int Index = -1; public object Target; }
public sealed class RankList {
    readonly List<SortKey> items = new();        // sorted by (Depth, Seq); Index = position
    readonly List<SortKey> pendingAdd = new(), dirty = new();
    long seq;
    public void Add(SortKey k)           { k.Seq = ++seq; pendingAdd.Add(k); }   // creation = "appended to the display list"
    public void Reseq(SortKey k)         { k.Seq = ++seq; MarkDirty(k); }        // taken from a pool (03 §1 re-add rule)
    public void SetDepth(SortKey k, double d) { if (double.IsNaN(d)) { d = 0; log.WarnOnce("nanDepth", …); }   // also in Add
                                                if (k.Depth != d) { k.Depth = d; MarkDirty(k); } }
    public void Remove(SortKey k);       // released to a pool or destroyed; hidden objects keep their key (03 §10)
    public void Settle(List<SortKey> changed);
    // more than 64 adds or dirty keys this frame (village load, 03 R15): Array.Sort by (Depth, Seq), every rank changes;
    // else: insert adds by binary search, move each dirty key left/right until ordered (insertion sort), then report
    // only the keys whose position changed (the moved key plus the ones it passed).
}
// Game/Render/DepthSorter.cs  [DefaultExecutionOrder(1000)]
//   LateUpdate: rankList.Settle(changed); foreach (k in changed) ((IRankTarget)k.Target).SetOrder(k.Rank - 32768);
// IRankTarget: RendererTarget (SpriteRenderer, MeshRenderer, LineRenderer, ParticleSystemRenderer)
//              TmpTarget (TextMeshPro: writes tmp.sortingOrder / sortingLayerID, which propagates to TMP_SubMesh
//                         children; writing the MeshRenderer directly would leave page-2/fallback glyphs at a stale rank)
//              GroupTarget (SortingGroup) — every target is on the built-in "Default" sorting layer (id 0).
```

A NaN depth (bad save, 0/0) is replaced by 0 with one warning: Phaser's `a._depth − b._depth` comparator makes NaN
"equal" (arbitrary order), and a NaN in `Array.Sort` makes .NET throw or leave the list unsorted. RankList test with NaN.

| What | Sort entry |
|---|---|
| Static prop, tree, fence, decal, stamp, ground mesh piece, fog piece, snow emitter | one renderer, one key, depth from 02/03 tables (ground sub-layers: `GROUND + i·0.001` in the 02 §6.1 bake order) |
| Character | **separate keys** for body (`inDepth`), each carried item (`sd + i·0.0005 + 0.001`), halo glow (`y − 0.5`), shadow (SHADOW). No SortingGroup: P1 makes the exact Phaser order free, and per-renderer alpha (resident fade-in) keeps working. This replaces 04 C5. |
| Pad stack (station in/out, shelf, till pile, crate) | one `SortingGroup` key at `stackDepth + 0.001`; children in item-index order (03 §8.2 `StackView`) |
| Phaser container (labels, price pair if built as one, want bubble, emote/chat bubble, carry pill) | one `SortingGroup` key; children `sortingOrder = child index`; alpha multiplied into each child (03 R10) |
| Flying item | key at `FLY + (flyCounter++ % 100)`, `Reseq` when taken from the pool |
| Particle emitter (dust, bursts, snowfall) | one key per emitter; `ParticleSystemRenderer.sortMode = YoungestInFront` (Phaser draws the alive list oldest first, newest on top; Unity's default `None` is buffer order), `renderMode = Billboard`, `alignment = View`, simulation space World for snowfall |
| Standalone world text (zone names at PAD_TEXT, float texts) | one `TmpTarget` key |

Display-list comparisons against Phaser (A22, `displaylist_newgame.json`) must not demand the tie order of `props`-atlas
pictures that were more than 450 px off screen: Phaser's `Culler` parks them and re-appends them, so Phaser's own tie
order for them changes at run time (`src/systems/Culler.js:17–25`). Unity keeps creation order, which is acceptable.

Cost: settle = one compare pass over ≈ 500–2,500 keys plus the moves; writes only where a rank changed. A carried
item pushed in mid-world shifts at most the entries above it (≤ ≈ 1,250 int writes, ≪ 1 ms); the loop does ≈ 12
hand-overs per second. If profiling ever shows cost, switch to gapped ranks (orders spaced by 16, renumber locally).

### 4.2 Camera and screen

| Item | Value |
|---|---|
| World ↔ Unity | `unity = (px/64, −py/64, 0)`; only `WorldSpace.ToUnity/ToPx` converts (01 §1.1) |
| Orthographic size | `(H/2) / zoomCur / 64` (H 1280…1600; zoom player range 0.6–1.7, overview unclamped ≈ 0.40) |
| Camera rect | the fitted 720×H frame: `rect = (OffX/sw, OffY/sh, FitW/sw, FitH/sh)` (01 §2.2) |
| Camera transform | `(cx/64, −cy/64, −10)` + shake; clear colour `#dbe6f2`; near 0.3, far 100 |
| Backdrop camera | depth −1, full screen, draws a vertical gradient `#e9f0f8 → #cfdcec` quad (letterbox bars); the GameObject is active **only when there are bars** (`OffX > 0 \|\| OffY > 0`): on normal 9:16–9:20 phones the World viewport covers the screen and a second camera loop is pure cost |
| Render scale | `renderScale = min(1, K / devPerLogical)` (01 §2.2 table) on a **runtime clone** of the URP asset (`var rp = Instantiate(projectAsset); GraphicsSettings.defaultRenderPipeline = rp; QualitySettings.renderPipeline = rp;` at boot), so Play Mode never writes the committed `URP-Slice.asset`; HUD (Screen Space Overlay) stays native |
| MSAA | high/mid 4×, low off (on the same clone, applied live — closes 01 Q5) |
| Precision | world x up to 6144 px = 96 units: float32 ulp 7.6e-6 units = 4.9e-4 px. No floating-origin needed. |

### 4.3 URP, colour, materials, shaders

* URP asset `URP-Slice.asset`: HDR off, MSAA per preset, depth/opaque textures off, SRP Batcher on, one renderer:
  `Renderer2D-Slice.asset` (no lights, no shadows, post-processing off).
* Every `SpriteRenderer` created by code gets `Materials.SpriteUnlit` (`Sprite-Unlit-Default`). Additive sprites
  (`blend: "ADD"` in a sheet def) get `Materials.SpriteAdditive` = our `SB_SpriteAdditive.shader` (a copy of the unlit
  sprite pass with `Blend SrcAlpha One`, reading `_MainTex`, `_RendererColor` and vertex colour; URP's sprite shader has
  no blend property and `Particles/Unlit` reads `_BaseMap`) (03 R11).
* Every material is an asset referenced from `Settings/Materials.asset` (a ScriptableObject held by the catalog); no
  runtime `Shader.Find` (it fails in a player for shaders no built material references).
* Shaders are **hand-written HLSL** (text diffs, Claude-editable), URP 2D compatible: `Tags { "Queue"="Transparent"
  "RenderType"="Transparent" "RenderPipeline"="UniversalPipeline" }`, one pass `Tags { "LightMode"="Universal2D" }`,
  `Blend SrcAlpha OneMinusSrcAlpha`, `ZWrite Off`, `Cull Off`, vertex colour multiplied in. World-anchored UVs and time
  terms are declared `float` (highp), never `half` (mediump on Mali swims by texels at UV ≈ 12 × 512); the CPU wraps the
  time offsets (`frac(u0)`, `frac(v0)`) before setting them. The sea quad and the land fill may use `Blend Off` (still
  Queue Transparent and ranked) so Mali's forward pixel kill can drop the sea under the land, if WP-4's batch/frame
  gate asks for it.
* **Batch gate (WP-4, WP-11).** P1 interleaves ≈ 66 textures in strict depth order, and Unity batches sprites only
  across consecutive orders with the same texture + material. Development builds log batches
  (`ProfilerRecorder.StartNew(ProfilerCategory.Render, "Batches Count")`) in the perf overlay; the Frame Debugger
  checks the start view and the `v4202` overview. Budget: ≤ 150 batches at the start view, frame time inside the
  J12 target on the low phone. Over budget → offline repack of the **world** Tier A atlases into 2–3 4096² pages
  grouped by what interleaves (props + nature + decor + items + generated `fv_shadow`/`fv_white` on one page;
  characters on another); `FrameRec` already carries page x/y, so `Sprite.Create`/pivots are unchanged. (This is our
  own repack, not a Unity Sprite Atlas, so A16 still holds.)

| Shader | Use | Maths |
|---|---|---|
| `SB_WorldUv` | land fill, zone floors, sea, fish bands, shallow band | `uv = worldPx.xy / tile + offset(t)`, worldPx from the object-to-world position × 64 with y negated (canvas patterns anchored at world (0, 0); 02 R4) |
| `SB_RoadComposite` | roads (start set and each overlay) | samples the RGBA mask (r = rim all, g = rim spine, b = body all, a = body spine): `rimA = 1−(1−0.3m1)(1−0.3m2)`, `bodyA = 0.92·(1−(1−b1)(1−b2))`; body (ground_road, world uv /256) over rim colour (110,130,170); output `A = bodyA + rimA(1−bodyA)`, `C = (Cb·bodyA + Cr·rimA(1−bodyA))/A` (02 §6.5) |
| `SB_ScrollTile` | fog banks | object-space uv with `_Scroll` offset from `tilePositionX` |

* Gamma colour space (A5). The WP-0 self-test draws a white sprite at alpha 0.32 over `#dbe6f2` and reads the pixel
  back (RenderTexture + `ReadPixels`, no `ScreenCapture`): Gamma must give `round(219 + (255−219)·0.32) = 231` (red
  channel) ± 1. WP-0 also (a) reads Player Settings → Other → Color Space and the 6000.3 release notes for a Gamma
  deprecation notice, (b) builds the self-test scene once in Linear and saves both phone screenshots
  (`ci/shots/gamma.png`, `ci/shots/linear.png`) for the designer. Decision rule: Gamma works and is not deprecated →
  Gamma; Gamma works but is flagged deprecated → still Gamma for the slice (it is the parity test), and the decision
  "Linear + one visual retune for the full port" is written into `CLAUDE.md`; Gamma refused or off → Linear now. The
  retune list is the `LookConstants` table (vignette 0.10, outline fill 0.28, road rim 0.30, x-ray 0.32, ghosts 0.2,
  shadow gradient, halo/glow alphas).

### 4.4 Ground (built once in `GroundBuilder`, geometry from Core)

| Layer (02 §6.1 order) | Unity form | Core source |
|---|---|---|
| Old sea + 2 fish bands (slice water = Phaser 저사양 look) | one quad each over x −1720…6464, y −200…2552, `SB_WorldUv` with the 02 §6.2.2 time terms | `SeaSpec` |
| Shallow band (under the snow) | strip mesh along the shore, vertex alpha 0 / 0.35 / 0.85 at sy −130 / −55.2 / +6 | `ShoreGeometry.Shallow()` |
| Land fill + vignette | one mesh: top edge = shoreline sampled every 8 px, bottom y 3450, x −1400…6144; vignette as vertex colour on two 240-px edge bands | `ShoreGeometry.Land()` |
| Rim strokes (3) + foam strip | triangle strips along `shoreY + off` (widths 12 / 7 / 5), foam = 32-px quads rotated per segment with the 02 §6.4.2 UVs | `ShoreGeometry.Rim()`, `.Foam()` |
| Roads | one quad over the start rect (x −1400…1800, y 0…2620) with `SB_RoadComposite` + `Generated/Ground/roads_start.png` (1600×1310 RGBA, 2 px per texel, uncompressed, 8.4 MB) | `PolylineRaster` + `GaussianBlur` (σ texel = σpx/2), run by the editor `RoadMaskBaker` |
| Path decor (77) + decals (19) | SpriteRenderers, pivot centre, depths `GROUND + 0.004/0.005/0.006` | `world_static.json` `pathDecor`, `decals` |
| Zone floors | polygon mesh with `SB_WorldUv`; halo = 18-px outer ring strip, offset +4 px, sampling a 1-D erf LUT (Gaussian edge, σ 9) at alpha 0.35; inner darkening and lips = strips | `FloorGeometry` |
| Zone/region road overlays (loaded saves) | one more quad + mask per overlay (`roads_zone_<id>.png`, `roads_region_<id>.png`), alpha property for the fade | `RoadMaskBaker` |
| Locked outlines, ghosts, lock, names | dashed strips (02 §6.9 rule), ghost sprites (tint 0x9FB3CC, alpha 0.2), TMP names (34 px, weight 900, stroke 8 → material preset `Stroke34_8`) | `FloorGeometry.Dashes()` |
| Stall name sign 「눈꽃 노점」 | `SignText`: TMP on the board with a vertex modifier applying the `signQuad` shear (y drops 1 px per 2 px of x), depth `y + 0.2`, text from `signText` (`sign_market_1`); 3× canvas text in Phaser (`Seller.js:150`) | `market/manifest.json` `signQuad` |

The masks are baked offline because they depend only on static road data, and baking them avoids a CPU-readable copy of
the textures (05 R8). The bake is deterministic, so a Core test checks a few mask texels against the analytic blur.
The masks (and any LUT saved as PNG) are **data**: they get their own import rule (§5.2: `Generated/Ground/` → Default
type, sRGB off, NPOT none, no mips, uncompressed RGBA32, Clamp, Bilinear), otherwise Unity's default importer would
rescale the 1600×1310 mask to 2048×1024, compress it and add mips.

### 4.5 See-through buildings (03 §6)

* `OccMaskBaker` (editor) reads each occluder frame from the **source PNG** (`ImageConversion.LoadImage` into a
  temporary readable texture, so import settings stay non-readable), marks 4-px cells with any alpha > 110, and writes
  `Generated/Occlusion/<atlas>.occ.bytes`: `"OCC1"`, frame count, then per frame `name (u16 length + UTF-8)`,
  `w, h, cw, ch, ox, oy (i16)`, bits (`ceil(w·h/8)` bytes, row-major). Occluder frames = keys matching
  `^tree_pine|lodge|hut|tent|mine_entrance|market|trade_post|station_`, life props with `topPx > 70`, station work frames,
  shop/deck layers, Tier B buildings.
* Core `Occlusion.Update(dt)` runs in tick step 17 with the 0.1-s decision, the three sample points, `big` = display
  width > 250, faded alpha 0.32, `a += (target − a)·min(1, dt·10)`, snap 0.02, linked layers, chief-only and worked-station
  rules exactly as 03 §6.3. Views copy `Alpha` to `SpriteRenderer.color.a`.

### 4.6 Korean font

Fact (`tools/fonts/README.txt`, `index.html:30`, `strings.js:1428`): the Phaser game ships **no** font file; its CSS
stack is `Pretendard, 'Apple SD Gothic Neo', 'Noto Sans KR', 'Malgun Gothic', sans-serif`. On an Android phone none of
the named families is installed, so the WebView draws `sans-serif`: Roboto for Latin and digits, the system Korean font
for Hangul (Noto Sans CJK KR on Pixel/AOSP, Samsung's own font on Galaxy), with weights 800/900 usually drawn as Bold.

| Item | Value |
|---|---|
| Decision step | WP-0: ask the designer's phone model; take a screenshot of the Phaser HUD (coin bar, objective panel, a zone name) on that phone; Claude compares glyph shapes. Default if the screenshot is not available: Noto Sans KR. Decide before WP-8 (label widths and panel sizes are tuned on the chosen font). |
| Files (default) | Noto Sans KR **Bold** and **Black** (OFL; Korean subset OTFs from the Noto CJK release, ≈ 4.5 MB each) + OFL text, in `Assets/_Snowbloom/Fonts/`; Roboto Bold (Apache 2.0/OFL) as the Latin/digit primary with Noto Sans KR as TMP fallback if the screenshot shows Roboto digits. Pretendard ExtraBold (`nurient/frost-village/tools/fonts/`) is offered to the designer as a **design choice**, not as parity. |
| Weights | `fontStyle 900` → Black, `800`/`700` → Bold (the phone draws 800 as Bold too) |
| TMP asset | Atlas Population **Dynamic**, Multi Atlas Textures on, atlas **2048 × 4096** (one page holds the 600 distinct Hangul + ≈ 110 ASCII/symbols of `strings.js` at a ≈ 90-px cell; 8 MB Alpha8; within the 4096 limit the low preset already assumes), render mode SDFAA, sampling point size 64, **padding 13** (≈ 20 %). Why 13: an SDF can draw an outline only `padding × size / sampling` px outside the glyph; Phaser's `strokeThickness T` puts `T/2` outside plus ≈ 1 px of AA; the slice's styles need 9.4 (34 px / 8), 9.6 (30 / 7), 8.5 (30 / 6), 9.3 (24 / 5) and 12.4 (18 / 5). |
| Strokes | One **material preset** per stroke style (34/8, 30/7, 30/6, 24/5, 18/5, + HUD styles): Outline Width + Face Dilate set so the face stays intact and the outline covers `[edge, edge + T/2]` like a canvas stroke drawn under the fill. Never per-instance `outlineWidth` (it instantiates a material per label and breaks batching). |
| TMP Settings | `Assets/TextMesh Pro/Resources/TMP Settings.asset` (from TMP Essentials, §8 WP-0): default font = the chosen font, `useModernHangulLineBreakingRules = true` (Korean wraps at spaces, like Phaser's word wrap) |
| Pre-warm | `FontPrewarm` (editor) writes every distinct character of `Data/strings.json` (ko + en) to `Fonts/prewarm_chars.txt` **in frequency order** (overflow glyphs land on page 2); `GameLoop.Start` calls `TMP_FontAsset.TryAddCharacters` with it under the loading overlay (no glyph hitches in play) |
| Missing glyphs | `❄` (U+2744), `🛷` (U+1F6F7): replaced in the slice strings (or a TMP Sprite Asset LATER); re-check coverage on the chosen font with a cmap scan in `FontPrewarm` |
| World text | TMP (`TextMeshPro`, not UGUI) with **`isOrthographic = true`** and `fontSize = px / 64f` (world units; without the flag TMP scales 3D text by 0.1); `rectTransform.sizeDelta` in units; inside the label's SortingGroup, or a `TmpTarget` key when standalone. P test: a 34-px zone name is ≈ 34 px tall on a 720-logical-px render at zoom 1. |
| Self-test | render 「소나무 숲」 34 px / stroke 8: the pixel at glyph edge + 4 px is stroke colour (outline not clipped); TMP Settings present; `TMP_Settings.defaultFontAsset != null`; the SDF shader is in the build |

### 4.7 HUD canvas

Screen Space Overlay canvas; `LogicalCanvasScaler` sets `scaleFactor = FitW / 720` and a centred root RectTransform of
720 × H logical units, so every HUD position from the Phaser code (logical px from the top-left, 01 D4) is used
unchanged; safe area from `ViewMetrics.SafeTop/SafeBottom`. Coin bar, objective panel, edge arrow, toasts, banners,
joystick, zoom buttons, settings gear: 06 §10, §12.3, §14 and 01 §3.5/§4.6.

Phaser's new-game HUD has more (`src/scenes/UI.js:234–242`, `UIv42.js`): the population chip right of the coin
counter (the slice shows it: people / cap from `VillageLife`), the map/overview button (included, §11), the whistle
button bottom left and the goal-window button. The slice draws **inactive look-alikes** of the whistle and goal
buttons at Phaser's positions; a tap shows the toast 「준비 중이에요」. After the first sale Phaser loads the `v42_core`
page and re-skins some HUD icons and the chief's halo; the slice keeps the stand-ins. Both are listed for the designer
next to J9 (§10.2) so they are not reported as bugs.

---

## 5. Asset pipeline (spec 05 option (a))

### 5.1 Flow

```
nurient/frost-village/assets/<frag>/...  --ArtSync (Tools/slice_assets.txt)-->  Assets/_Snowbloom/Content/<frag>/...
      import: FvTexturePostprocessor / FvAudioPostprocessor (05 §15.1, §10.3)
      CatalogBuilder -> Generated/Catalog/FvAssetCatalog.asset  (path string -> TextAsset / Texture2D / AudioClip, PNG w/h)
      OccMaskBaker, RoadMaskBaker, FontPrewarm -> Generated/...
runtime: Village.unity loads (async from Boot) -> every texture/clip the catalog references (Tier A + A+ + B; B+ in M1b)
         FvAssets.Init(catalog): Core ManifestMerger merges the boot manifests (later wins; extends adds anims)
         Finalize(): sheet/sprite/character anims, fv_shadow, fv_white
         FvAssets.Sprite(key) -> Sprite.Create(tex, rect(x, texH − y − h, w, h), pivot(ax·srcW − offX, ...), 64) cached
```

### 5.2 Classes

| Assembly | Class | Job |
|---|---|---|
| Editor | `FvTexturePostprocessor : AssetPostprocessor` | Rule 1, `Assets/_Snowbloom/Content/`: 05 §15.1 (as corrected there): Sprite type, Single mode, PPU 64, FullRect, no mips, NPOT none, Bilinear, Clamp (Repeat for ground/road patterns), alphaIsTransparency, not readable, max size = nextPow2(max(w, h)) with w/h read from the **PNG IHDR bytes** (shared helper with `CatalogBuilder`; `GetSourceTextureWidthAndHeight` can report 0 on a first import); Android ASTC 6×6 (buildings, props, ground, `ui2/ground_road.png`, Tier A+ extra villagers, Tier B+ exteriors) / 4×4 (characters, UI, FX, items, emotes); Standalone BC7; `compressionQuality` 50 in development, 100 for the go/no-go build. Non-÷4 files (`bld_work` 774 wide, `ui7` 458 wide) are fine for ASTC; on PC they fall back to RGBA32 (editor only). **Rule 2, `Assets/_Snowbloom/Generated/Ground/`** (masks, LUTs = data): Default type, `sRGBTexture = false`, NPOT none, no mips, `textureCompression = Uncompressed` with Android/Standalone overrides `RGBA32`, Clamp, Bilinear, not readable, max 2048. EditMode test: imported size = PNG size and format RGBA32 for every Generated texture. |
| Editor | `FvAudioPostprocessor : AssetPostprocessor` | `.ogg` only (never the MP3 twins): `loadType` sfx Decompress On Load, ambience Compressed In Memory, music Streaming; `compressionFormat = Vorbis`, `quality = 0.7f`, `sampleRateSetting = PreserveSampleRate` and `preloadAudioData` on `AudioImporterSampleSettings` (`defaultSampleSettings` + `SetOverrideSampleSettings("Android", …)`; the importer-level `preloadAudioData` is obsolete in Unity 6); `loadInBackground` on the importer |
| Editor | `ArtSync` | menu + batch method `Snowbloom.EditorTools.ArtSync.CopySlice` with `-sbPhaser D:\Work\Snowbloom\nurient\frost-village`: copies every file in `Tools/slice_assets.txt` (Tier A 40 + Tier A+ villagers + Tier B 26 textures (+ Tier B+ in M1b), their atlas JSON, the boot `manifest.json` files, ≈ 20 OGG) keeping paths; reports missing files |
| Editor | `CatalogBuilder` | scans `Content/`, builds the catalog with the PNG width/height read from the PNG header; asserts every imported `Texture2D` has exactly the PNG size (05 R1) |
| Editor | `OccMaskBaker`, `RoadMaskBaker`, `FontPrewarm` | §4.4–4.6 |
| Core | `ManifestModel`, `ManifestMerger` | 05 §3: boot fragments in `FRAGMENTS` order, later wins; `extends` adds anims; unused `vil_/wkr_/char_` atlases; late fragments first-wins (LATER) |
| Core | `FrameRec`, `AtlasJson`, `TfAtlas` | JSON-hash frames and the `tfatlas` install (05 §4, §7) into one record `{x, y, w, h, offX, offY, srcW, srcH}`; assert `rotated == false` |
| Core | `PivotMath` | `pivot = ((ax·srcW − offX)/w, 1 − (ay·srcH − offY)/h)`, never clamped (596 frames fall outside 0..1); `flipShift = scaleX·srcW·(1 − 2·ax)` |
| Core | `CharDefBuilder`, `AnimResolver` | `COMMON_CHAR ⊕ CHAR_DEFAULTS ⊕ manifest`, fallback chain, `RenderDirsOf`, `nearestDir` (04 §4.2–4.4, 05 §6) |
| Game | `FvAssetCatalog : ScriptableObject` | the path → asset table |
| Game | `FvAssets` (static) | 05 §14 API: `Sprite(key)` never null (placeholder + one warning), `Has`, `Pick`, `Def`, `SourceSize`, `Nine`, `CharAnim`, `AudioDef`, `AudioGroup` |
| Game | `SpriteFactory`, `AnimLibrary`, `Placeholders`, `GeneratedTextures` | sprite cache per `(atlas, frame, ax, ay)`; Core anim → `Sprite[]`; placeholder pictures with the right anchor; `fv_shadow` 64×32 radial, `fv_white` 8×8, carry-pill plate, `fv_halo` stand-in |

### 5.3 Asset tiers (replaces the tier totals of 05 §16; file lists stay in 05)

| Tier | Contents | When | GPU (ASTC) |
|---|---|---|---:|
| A | 05 §16.2 (40 textures) **+ `villagers/vil_npc_kid_prankster.png`** (4th resident of `moveIns.start`) | M1a | A + B together ≈ 30 MiB (05 D5, mixed 4×4/6×6) + 1.5 MiB for the prankster |
| A+ | **every other `villagers`/`villagers2`/`villagers3` look** (`kind: "villager"`, 17 + 12 + 6 defined; villagers3 wins key by key, so the old chef/aunt/blacksmith files are skipped): Phaser background-loads all of them right after a new game (`Game.js:424–479`, `lazyAllowed` falls through to `true`) and `Market.customerKeys()` (`Seller.js:316–320`) adds each loaded look to the customer pool, so from about the 3rd–4th customer the line shows ≈ 25 looks. Needed anims are already in the atlases (idle, walk, carry_walk, happy). | M1a | ≈ 22 MiB at 6×6 (≈ 50 MiB at 4×4) |
| B | 05 §16.3 (26 textures) | M1a | (in the A + B figure) |
| B+ | **static exteriors of the late buildings** that 26 of the 27 v4 fixtures contain (rail `station` on `r_station` 26/27, `big_restaurant` 21, `town_hall` 17, `chief_office` 11, `bank42` 9, `depot42` 9; measured on `tools/test/fixtures/v4*.json`): the closed-exterior layers in manifest `drawOrder` from `town/town_civic.png` (hall, station), `town/town_shops.png` (restaurant), `office/office_bld.png`, `civic/civ_bank.png`, `logistics/lgx_center_a..d.png`; no interiors; plus `workers/wkr_*` (2nd/3rd worker looks) | M1b (WP-10) | ≈ 11 MiB at 6×6 |
| C | everything else (05 §16.3 Tier C list minus the above): placeholders acceptable | — | — |

Memory at load ≈ 55 MiB (M1a) / ≈ 66 MiB (M1b) of textures, plus 8.4 MB road mask and the 8 MB font atlas: inside the
WP-11 400 MB PSS target. **Correction of revision 1:** Phaser does *not* show placeholders for the late buildings; it
fetches their art on demand (`OfficeBuilding.js:96`, `BankBuilding42.js:31`, `DepotBuilding.js:40`, `TownHall.js:13`,
`RailStation.js` lazy image), so a placeholder is visible there only for the seconds the file loads. In the slice a
Tier C key shows the placeholder permanently; with Tier B+ no building of the 27 v4 fixtures does. What stays
different in an old village (agreed with the designer before WP-10, written next to J11): the rail strip's rails and
the town's street art are plain snow, town-region people (`townfolk`/`officefolk` tfatlas) are absent, interiors are
closed.

---

## 6. Input

| Piece | Assembly | Detail |
|---|---|---|
| `InputRouter` | Game | `OnEnable`: `EnhancedTouchSupport.Enable()` (no `TouchSimulation`). `Poll()` once per frame in `GameLoop` step 1: build **one event list** from `Touch.activeTouches` (+ the mouse) with a timestamp (`touch.startTime` for Began, `touch.time` for Moved/Stationary/Ended/Canceled), stable-sort by time, then by phase (Ended/Canceled before Began for the same `touchId`, which Android may reuse within a frame), and feed `PointerRouter` in that order (Phaser receives DOM events in real order; "all downs, then moves, then ups" would turn "A lifts while B lands" at 30 fps into a spurious pinch). Router id = `touchId + 1`; mouse left button = id 0 (PC/editor only, never part of a pinch); wheel = `Mouse.current.scroll.y` **sign only**, one step per frame (01 §3.5; Input System ≥ 1.8 reports uniform ±1 anyway); keys = W/A/S/D + arrows. Device px (origin bottom-left) → logical px via `ViewMetrics.DeviceToLogical`. `OnApplicationFocus(false)` → `Release()`, pinch cleared. Router tests: "A up + B down in one frame → B is the joystick, no pinch"; "same id up + down in one frame". |
| `UiHitTester` | Game | per finger at its down position: `EventSystem.RaycastAll`; over UI = any hit with a `Selectable` or a `HudBlocker` component, except the dog bar / skip chip (01 §4.3). **Overrides 01 §4.3's `EventSystem.IsPointerOverGameObject(p.id)`**: with `InputSystemUIInputModule` touch pointer ids do not match `touchId`, and calling it outside UI event processing returns last-frame data with a warning. No `UnityEngine.Input.*` call and no `StandaloneInputModule` anywhere (both throw with Active Input Handling = new); an EditMode test scans scenes/prefabs for `StandaloneInputModule`. |
| `PointerRouter` | Core | 01 §4.3 state machine: taps (≤ 300 ms, ≤ 16 logical px), second finger → pinch (`d0 = max(20, device px)`, `z0`), third finger ignored, pinch "ending" state, joystick hand-over to the remaining finger, panel-open gating |
| `InputCore` | Core | 01 §4.4–4.5: floating joystick radius 78, dead zone 8, full speed at 58.5, keys replace the stick, priority override > human > pilot (GoalWalk), `LastTouchMs`, `LastActivityMs`, `Source` |
| `CameraModel.SetZoom/ZoomBy/ToggleOverview` | Core | pinch `z0·dist/d0`, wheel ×1.12, buttons ×1.25, zoom about the screen centre (01 D7) |
| `GoalWalk` + `WalkTo(Vec2d px)` | Core | 01 §4.8 steering (arrive 8, waypoints 30, detour after 2.5 s ×2, side-step after 1.6 s, give up after 7 s, last-leg slow-down, `blocksPay` while walking); route = `Roads.Route(p, T, near 220)` with the landing door legs; before WP-6 a straight line |
| Ground tap → walk | Core + Game | in `PointerRouter.OnUp` for a tap: `life.Tap(w)` first (resident/pet hit box, 04 §13.10); if nothing was hit and `Settings.tapWalk` (new field, default true in the slice, not written to the Phaser settings JSON) → `GroundTap.Go(w)` (§6.1). |
| Editor testing | — | mouse drag = joystick, wheel = zoom, keys = move. **Unity's Device Simulator does not do multi-touch**: pinch is tested on the phone; in the editor a debug pinch (hold Alt and drag = a virtual second finger mirrored about the screen centre) drives `PointerRouter`'s two-finger path for H checks. |

Player settings: Active Input Handling = **Input System Package (New)** (ProjectSetup writes `activeInputHandler = 1`
in `ProjectSettings.asset` through `SerializedObject`; this needs an editor restart, so `ProjectSetup.ApplyCli` runs
as its own batch invocation, `ci.ps1 -Task setup`, never inside a build call).

### 6.1 Ground-tap mode (the designer's tap-to-walk; Phaser has none, so these rules are ours)

GoalWalk was built for goal rows: a row has a name, the walk toasts `g_walk {place}` and `g_arrived {place}`, a held
finger cancels with `g_cancel`, a stuck walk gives up after 7 s with `g_stuck`, and it refuses during the tutorial
(`g_tutorial`) (`src/systems/goals/GoalWalk.js:109, 145, 177–185`). Ported literally, a ground tap would give two odd
toasts per tap, push into colliders and refuse during the tutorial. `GroundTap` (Core) wraps the same steering:

| Case | Rule |
|---|---|
| Target on a pad | a tap inside a pad's iso ellipse (shelf, register, till, grill in/out, reel spot, unlock pads; 03 `Pad` gdist test) walks to that pad's centre |
| Target elsewhere | `Collision.FreeSpot(x, y, 16, 120)` snaps it out of colliders (stall, pines, hut); off land or no free spot → toast `g_noWay` only, no walk |
| Feedback | **quiet** walk: no `g_walk`, `g_arrived`, `g_cancel`, `g_stuck` toasts (stuck = silent stop after 7 s); a small ring at the target in the pad-pulse look (`ui_ring_bg`, 0.25 s grow, fades 0.3 s after arrival or on stop) |
| Re-tap | a new tap during a walk re-targets at once, no cancel; the 0.12-s hold-cancel is skipped when the finger lifts inside the tap limits (≤ 300 ms, ≤ 16 logical px); the joystick still overrides at once (human > pilot) |
| Tutorial | allowed (bypasses `available`); the tutorial camera framing stays as Phaser's; J6 has a case for it |
| Pay/pick rules | unchanged: `blocksPay` while walking, pads work on arrival exactly as when walked by hand |

Tests (D): tap on the stall body → target = FreeSpot outside its collider; tap on the shelf pad → pad centre; tap on
the sea → `g_noWay`, no walk; tap, tap again mid-walk → one walk, no toast; joystick during a walk → walk stops.

---

## 7. Save

| Item | Decision |
|---|---|
| Format | the Phaser JSON text, unchanged (07 S2): stamp `{"v":8,"lv":43,"t":…` first; `lv` stays 43 while the shape is unchanged (07 R7) |
| Store | `FileKvStore : IKeyValueStore` (Game) per 07 §2.2: `Application.persistentDataPath + "/kv/"`, one UTF-8 file per key, upper-case letters escaped as `!x`, write `.tmp` + `Flush(true)` + `File.Replace`/`File.Move`, in-memory cache. `MemoryKvStore` (Core) for tests. |
| Paths | Windows editor and Windows player: `%USERPROFILE%\AppData\LocalLow\Snowbloom\<productName>\kv\` (`눈꽃마을 시험판`); Android: the app-specific files directory of `com.snowbloom.village.slice` (kept across updates, removed at uninstall) |
| JSON | `JsJson`: Newtonsoft `JObject` for parsing (`DateParseHandling.None`, out-of-range literals → ±Infinity), our `JsJsonWriter` for writing (§2.3; `JsNumber.Format` = ECMA `Number::toString`: `5`, `0.7999999999999999`, `0.00001`, `1e-7`, `0.0000015` (1.5e-6; decimals from 1e-6 up), `123456789012345680`, `1e+21`, `-0` → `0`; JS string escaping), `\z` anchors in every regex |
| Load | `SaveService.Load()` = parse → newer check → `KeepPre43` → `MigrateSaveEx` (MIGRATE 1→8, `Remap43`, `Check43`, `SanitizeSave`, `Check43b`) → holds (`newer`, `stale`, `failed43`) → `Pending43` until `Confirm43` (07 §5, §8.5) |
| Write | `Game.Serialize()` in the 07 §10.3 order: live sections (`territory`, `sites`, `coins`, `progress`, `stations`, `market`, `player`, `life`, `labour`, `cid`, `onb`, `v43`) else the loaded block verbatim (pass-through); `Save.Write` refuses while held or `Pending43` |
| When | every 5 s of game time (tick step 19), `OnApplicationPause(true)`, `OnApplicationFocus(false)` on Android, `OnApplicationQuit` — synchronous. The WP-11 perf overlay measures `SetItem` (serialize + write + fsync + replace); if p95 > 4 ms on the low phone, the 5-s autosave serializes on the main thread and writes + fsyncs + replaces on a background `Task` (one in flight, newer value coalesced); pause/quit stay synchronous. |
| Old village | settings → 「마을 옮기기」 → 「불러오기」: 「붙여넣기」 reads `GUIUtility.systemCopyBuffer` (no 100-K-char text field, 07 R6); fallback when it returns empty on the phone: JNI `ClipboardManager.getPrimaryClip().getItemAt(0).coerceToText(activity)` on the UI thread (activity from `com.unity3d.player.UnityPlayer.currentActivity`, works with GameActivity) → `DecodeVillage` → `DryRun` → confirm card (07 §11.5 text) → `ApplyVillage` (spare code in `frostVillage.move.backup`) → reload Boot. WP-0 self-test line (7) proves the paste on the phone. |
| Fixtures | development builds: settings → 「시험 마을 불러오기」 lists `v4202_25min`, `v43a3_fresh25`, `v4202_fresh_tut`, `v43a3_late` (hall, restaurant, office, bank, depot: the hard case) (TextAssets in `Assets/_Snowbloom/DevFixtures/`, referenced by a `DevFixtures` asset, compiled under `DEVELOPMENT_BUILD \|\| UNITY_EDITOR`); format A → `{save key: JSON without "_" keys}`, format B → its `keys`; then the same `ApplyVillage` path. Editor: menu `Snowbloom/Save/Load Fixture…` writes into the editor's kv folder; `Snowbloom/Save/Open kv folder`, `Clear kv`. |
| Hold UI | one Korean modal per hold (07 Q3) with 「새 마을로 시작」 |
| Settings | `frostVillage.settings.v1` in the same store, 07 Appendix B rules (+ `tapWalk` kept in a separate Unity-only key `snowbloom.unity.v1` so the Phaser JSON stays identical) |

---

## 8. Work packages

Two tracks can run at the same time: **Track C** (pure Core, verified with `dotnet test`, can be written before Unity
is installed) and **Track U** (Unity). Estimates are Claude working days on the PC, re-baselined in revision 2 (§8.2),
±30 %; they include batchmode overhead (first import, PlayMode runs, APK builds) but not waiting for people.
Two milestones (A21): **M1a** ends with the WP-11 go/no-go build; **M1b** adds the old-village path.

```
WP-R (cloud side, day 1-2: shots + display list + 2 traces) ------------------> oracles (T) for WP-4, WP-6a, WP-8a
WP-0 bootstrap -+- WP-1 core math/data -+- WP-2 assets -+- WP-3 render base - WP-4 world/ground --+
                |                        +- WP-9a save core, own saves (C) ---------------+         |
                |                        +- WP-6a nav/actors core (C) ---+                |         |
                |                        +- WP-8a loop core (C) ---------+                |         |
                |                                                        v                v         v
                |   WP-5 input+camera -- WP-6 characters -- WP-7 x-ray -- WP-8 loop -- WP-9 save (own) -- WP-11 go/no-go build   = M1a
                |                                                         WP-9b old-save chain (C) -- WP-10 old village + Tier B+ = M1b
                +- WP-12 Act 1 coach cards (should; after M1a)
```

### WP-0 — Bootstrap the PC and an empty, buildable project (2 days; human for installs)

* **Human:** (done 2026-11-21: the designer installed Unity Hub and Unity **6000.3.x LTS** at the Hub's default location —
  `ci.ps1` finds it through `secondaryInstallPath.json` or `C:\Program Files\Unity\Hub\Editor\…`; check the exact version on the PC); Unity **6000.3.x LTS** with Android Build Support + OpenJDK +
  Android SDK & NDK tools; activate a Personal licence in the Hub; Git for Windows + Git LFS; .NET 10 SDK
  (`winget install Microsoft.DotNet.SDK.10`); Node 22 LTS (for data export); GitHub CLI `gh` (logged in; APK delivery);
  Claude Code. Tell Claude the designer's phone model and send one screenshot of the Phaser HUD on that phone (font
  decision, A10). The designer installs one hello-world APK through the delivery path (§9.1 `publish`) once.
* **Claude (PowerShell):** `New-Item -ItemType Directory D:\Work\Snowbloom`; `git clone --depth 1
  https://github.com/hyun800115-create/nurient D:\Work\Snowbloom\nurient`; create the project (Hub → New project →
  Universal 2D → `D:\Work\Snowbloom\SnowbloomUnity`; a human click, or `Unity.exe -createProject <path>
  -cloneFromTemplate <Editor>\Data\Resources\PackageManager\ProjectTemplates\com.unity.template.universal-2d-*.tgz` if
  that template file exists); `git init`, §1.4–1.5 files, LFS setup; manifest delete/add list (§1.3); delete the
  template's `InputSystem_Actions.inputactions` and sample scene; import **TMP Essential Resources** once
  (`TMPro.TMP_PackageResourceImporter.ImportResources(true, false, false)` from an editor method — verify the
  signature in 6000.3 — or menu Window → TextMeshPro → Import TMP Essential Resources by hand) and commit
  `Assets/TextMesh Pro/`; `ci.ps1 -Task setup` (ProjectSetup as its own batch call; the editor restarts once for Active
  Input Handling).
* **Files:** the asmdefs (§2.2), `Core/Polyfill/IsExternalInit.cs`, `Core/BuildInfo.cs` (one trivial type),
  `Tests/Core/SmokeTests.cs`, `DotnetTests/*` (§2.4, incl. ApiCheck), `Editor/Ci/{Ci.cs, CliArgs.cs, GitInfo.cs,
  ProjectSetup.cs, BuildCli.cs}`, `Game/Debug/SelfTest.cs`, `Game/Boot/BootLoader.cs`, `Scenes/Boot.unity`,
  `Settings/URP-Slice.asset`, `Renderer2D-Slice.asset`, `Tools/ci.ps1` (§9), `Tools/export/export_data.mjs`,
  `.github/workflows/core-tests.yml`, `README.md`, `CLAUDE.md` (rules: Core purity, no double→int casts, invariant
  culture, never hand-edit core packages, no keys in git, Korean plain words to the designer, the A5 colour-space
  decision), `Docs/PortSpecs/*` and `Golden/*` (copied from the spec workspace — see risk K1).
* **ProjectSetup.Apply()** (idempotent, batch-callable, `NamedBuildTarget` APIs only): company `Snowbloom`, product
  `눈꽃마을 시험판` (Android label; if a tool chokes on the Korean name, use `Snowbloom Slice` and keep the label via the Android manifest), id `com.snowbloom.village.slice`, colour space per A5, IL2CPP, ARM64, API level .NET Standard 2.1,
  min API `max(24, lowest offered)`, target API = highest `SDK/platforms/android-NN` the Hub module installed,
  `SetUseDefaultGraphicsAPIs(BuildTarget.Android, false)` then `[OpenGLES3]`, portrait only, Optimized Frame Pacing on,
  render outside safe area on, splash off, managed stripping Minimal + `link.xml` (preserve `Snowbloom.Core`,
  `Newtonsoft.Json`), Force Text, `VersionControlSettings.mode = "Visible Meta Files"`, Parallel Import on, Active Input
  Handling = new, `GraphicsSettings.defaultRenderPipeline` + `QualitySettings.renderPipeline` on every quality level,
  `EditorBuildSettings.scenes` = Boot, Village; asserts the §1.3 package lists and that TMP Settings exist.
  `BuildCli.AndroidDev` never applies settings: it **asserts** them and exits 1 with a message if one differs.
* **SelfTest** (shown on the phone in development builds, also logged): (1) Gamma pixel check (§4.3; once more in a
  Linear build for the screenshot pair); (2) render scale: a 1-px black/white checker quad fills the World viewport,
  a 4×1 block is read back after the frame (RenderTexture + `ReadPixels`): alternating at scale 1, grey at 0.5 — 01 R8
  (no public API reports URP's internal target size, and a renderer feature would need the RenderGraph API);
  (3) `DeflateStream` raw round trip of 100 KB + decode of the 07 `tinyZ` vector — 07 R4; (4) `FileKvStore`
  write/replace/read of a 10 KB value; (5) TMP: Settings present, default font set, SDF shader in the build,
  「눈꽃마을 첫날이에요」 with no missing glyphs, 「소나무 숲」 34 px / stroke 8 not clipped; (6) device facts (RAM via
  JNI `totalMem`, cores, GPU string, SDK) for 01 R17; (7) clipboard: a button reads `systemCopyBuffer` and shows its
  length and first 20 characters after the tester copies `save_code_v4202_25min.txt` from a chat app (JNI fallback,
  §7); (8) haptics: 8 / 15 / 40 ms buzzes (felt, not ≈ 0.5 s); (9) `JsNumber.Format` of the 07 golden vectors on
  IL2CPP equals the expected strings.
* **Acceptance:** `ci.ps1 -Task compile` exit 0; `ci.ps1 -Task dotnet` 1 test passed and ApiCheck builds;
  `ci.ps1 -Task editmode` exit 0; `ci.ps1 -Task android` produces an APK; `install` (USB) or `publish` (delivery) and
  all self-test lines read OK on the phone; colour-space decision recorded. **Verify:** D, E, B; Ph (read the
  self-test screen; Claude can also `adb pull` a screenshot, §9).

### WP-1 — Core maths and data (1 day) — Track C

* **Files (Core):** `Math/{Vec2d, RectD, JsMath, Iso, Dirs, JsRng, Shore}.cs`, `Data/{WorldStatic, WorldData, Balance,
  Items, Strings, JsonRead, LookConstants}.cs`, `Util/{ILog, IRandom, ConstRandom, Pool, OrderedMap}.cs`. **Data:** already exported on the cloud side into `nurient/frost-village/docs/unity_port/Data/*.json` (copy them; re-run
  `docs/unity_port/tools/export_data.mjs` with Node 22 only when the Phaser data changes); copy `02_world_ground_static.json` to `Data/world_static.json`.
* **Tests:** `IsoTests` (isoPt, isoInv(90.5, 0) = (1, 1), gdist((0,0),(30,20)) = 50), `DirsTests` (01 §10 / 04 §21 vectors
  incl. (1, 0.2) → 0 and (1, 0.21) → 1; nearestDir cases), `ShoreTests` (02 §4 samples ±0.01, maxShore 2467.89, seaH
  2508), `ZTests` (grill (1004, 590), stall (1207, 782)), `JsRngTests` (raw outputs computed from the real
  `Placeholders.js` rng in Node: seed 1234 → 0.07743594027124345, 0.4321203085128218, 0.9356880304403603; seed 11 →
  0.0006924520712345839, 0.17195475357584655; seed 5 → 0.0003147509414702654, 0.07822597143240273; the 02 §7.4.1 C#
  port reproduces them; the full border-forest replay against the JSON comes with the generator port, LATER), `JsMathTests`
  (JsRound(−2.5) = −2; `ToInt32`: NaN → 0, 2^31 → −2^31, −1.5 → −1, 4294967297 → 1; `ToUint32(−1)` = 4294967295),
  `OrderedMapTests` (remove + re-add keeps JS order), `StringsTests` (`fmt(12345)` = "12,345" also under `de-DE`,
  `t("hired", name)`), `WorldStaticTests` (13 fences / 77 decor / 103 trees / 8 life props / 77 stamps / 19 decals
  visible at a new game); the cast grep check is green.
* **Verify:** D, E.

### WP-2 — Asset pipeline (2.5 days)

* **Files:** Editor `Import/{FvTexturePostprocessor, FvAudioPostprocessor, ArtSync, CatalogBuilder, PngHeader}.cs`; Core
  `Assets/{ManifestModel, ManifestMerger, FrameRec, AtlasJson, TfAtlas, PivotMath, CharDefBuilder, AnimResolver,
  AssetLists}.cs`; Game `Assets/{FvAssetCatalog, FvAssets, SpriteFactory, AnimLibrary, Placeholders,
  GeneratedTextures, Materials}.cs`; `Tools/slice_assets.txt` (Tier A + A+ + B, §5.3).
* **Tests:** `PivotTests` (Core, D): 03 §2.2 table (11 rows, 1e-5), 05 §5.1 (`chief_lodge` (0.44751, 0.30864),
  `item_fish_raw` (0.58929, 0.21739), `vil_npc_aunt idle_S_0` (0.5, 0.07216)), 04 `walk_S_0` (0.4286, 0.0659),
  `pet_dog catch_S_3` pivotY ≈ −0.26; `ManifestMergeTests` (atlas `vil_npc_aunt` → `villagers3/vil_npc_aunt.png`;
  `player` gains `reel`/`fish` from deck43; `pet_dog` from pets2; the villager-look list equals Phaser's
  `Assets.charKeys('villager')` minus `^npc_(clerk|porter|toddler)`); `TfAtlasTests` (a 3-frame sample). EditMode (E):
  every catalog texture has its PNG size, ASTC/BC7 overrides set, no mips; every `Generated/Ground` texture is RGBA32 at
  its PNG size; `FvAssets.Sprite("chief_lodge").pivot` equals PivotMath; all textures load; `Sprite("unknown_key")`
  returns a placeholder and warns once.
* **Verify:** D, E; H (one look at a few sprites in a test scene).

### WP-3 — Render foundation: sort, camera, world images (2.5 days)

* **Files:** Core `Render/{Depth, SortKey, RankList, StackPlace}.cs`, `View/{ViewMetrics, CameraModel, FrameClock,
  PerfPresets, SoundPos}.cs`; Game `Render/{WorldSpace, WorldImage, DepthSorter, RankTargets (incl. TmpTarget),
  WorldViews}.cs`, `Camera/{VillageCamera, ViewMetricsService, LetterboxBackdrop, RenderPipelineClone}.cs`,
  `UI/LogicalCanvasScaler.cs`, `Shaders/*.shader`, `Scenes/Village.unity`.
* **Tests (D):** `RankListTests` (tie: A then B at equal depth → rank(B) > rank(A); `Reseq` moves a key after its ties;
  3450.000001 < 3450.000002; 1,000 random inserts equal a full sort; bulk path > 64 adds; a NaN depth sorts as 0 and
  warns once); `CameraModelTests` (new game camRect (−1400, −150, 3460, 3030), start centre (985, 600) zoom 1.2,
  overview 0.40 at (900, 1270), clamp sticks left/top when the view is larger, + button 1.2 → 1.5 → 1.7, pinch 2× clamps
  to 1.7, zoom easing per 16.67 ms); `ViewMetricsTests` (H 1600/1280/1600+bars for 1080×2400/1920/2520; k and render
  scale table of 01 §2.2); `FrameClockTests` (10-sample mean, 200 ms cap). **(P):** two sprites with depths 100.2 /
  100.7 and a third at 100.5 get orders in that order; a flipped `tree_pine_a` at (1000, 1500) scale 0.95 has transform
  x = 16.9016 (03 §13); boot twice in one session without errors; the committed `URP-Slice.asset` is unchanged after a
  Play Mode run that switched presets.
* **Verify:** D, P; H (camera and letterbox in the Device Simulator at 1080×2400 and 1080×2520; backdrop camera off at
  2400, on at 2520).

### WP-4 — World and ground of a new game (5 days)

* **Files:** Core `World/{WorldBuilder, Territory, Visibility, BuildingDefs}.cs`, `Ground/{ShoreGeometry, FloorGeometry,
  PolylineRaster, GaussianBlur, SeaSpec}.cs`, `Nav/Collision.cs` (data side: colliders from the props); Game
  `Ground/{GroundBuilder, SeaView, FogView, SnowfallFx}.cs`, `Render/{StaticPropView, DeckView, ShopView, SignText,
  StationView, FxPlayer}.cs`; Editor `Bake/RoadMaskBaker.cs` → `Generated/Ground/roads_start.png`.
* **Content:** 02 §11 in full: old sea, shallows, land, vignette, rim, foam, roads, 77 stamps, 19 decals, plaza floor,
  4 locked outlines with ghosts, lock icons and names (stroke material presets), 13 fences, 77 decor (campfire loops,
  8 floaters), 103 trees with flip shifts, 8 life props (lantern twinkle), chief hut, fisherman hut, grill, stall
  stage 1 with its sheared name sign 「눈꽃 노점」 (`SignText`, §4.4), deck tier 1 + landing, fog walls (scroll + puffs),
  snowfall (`YoungestInFront`); colliders and visibility predicates (zone, region, until).
* **Tests:** D: `RoadMaskTests` (mask value at a road centre ≈ 1 and 60 px off-road ≈ 0, analytic blur ± 0.02);
  `WorldBuilderTests` (positions and depths equal the JSON for every visible element; collider radii of 02 §7.3; the
  flipped tent at 1290.003). P: renderer counts per kind; `NewGameShotTest` renders the camera at (985, 600), zoom 1.2,
  720×1280 to `ci/shots/newgame.png`. **T:** `DisplayListTest` compares the Unity world views with
  `Golden/displaylist_newgame.json` at t = 0 and t = 5 s: same texture keys/frames, positions within 0.5 px, flips,
  scales, alpha, visibility, and the same relative order for every overlapping pair (§4.1 Culler exception). **Gate:**
  batches at the start view logged and ≤ 150 (§4.3), else the repack step before WP-5.
* **Verify:** D, P, T; **Ph/H: the designer compares `newgame.png` and the phone with Phaser following the §10.2 look
  protocol** (same silhouettes, road widths, rim, plaza edge, flipped pines, the stall sign).

### WP-5 — Input, joystick, camera behaviour (2 days)

* **Files:** Core `Input/{InputCore, PointerRouter, InputFrame}.cs`; Game `Input/{InputRouter, UiHitTester,
  DebugPinch}.cs`, `UI/{JoystickView, ZoomButtons}.cs`; camera tutorial framing, `FocusCamera`, shake, overview in
  `CameraModel`.
* **Tests (D):** router: tap; drag; second finger → pinch; lift A then B; lift B then A; **A up + B down in one frame →
  B is the joystick, no pinch; same id up + down in one frame**; panel opens mid-drag; third finger ignored; mouse id 0
  excluded from pinch; tap at 250 ms / 6 px fires `life.Tap` and gives vec 0; at 12 px fires and gives mag 0.205
  (01 §10). Joystick: 40 px → (0.684, 0); 120 px → base moves 42 px, vec (1, 0). Chief speed 255 / 188.7. E: no
  `StandaloneInputModule` in any scene/prefab.
* **Verify:** D, E; **Ph: joystick and pinch feel, zoom range, letterbox on the designer's phone** (pinch is phone-only).

### WP-6 — Characters, navigation, residents (5 days; 6a = Core part, Track C)

* **Files (Core):** `Sim/{Scheduler, Easing, ItemStack, Flights, ItemPool, FramePlayer, AnimSet}.cs`,
  `Nav/{Collision, Roads, Paths, BinaryHeap, MoveAgent, FreeSpot, GoalWalk, GroundTap}.cs`, `Actors/{CharacterSim,
  PlayerSim, Resident, VillageLife, JobPet, Bubbles, CarryPillModel, HaloModel}.cs`; Game `Render/{CharacterView,
  FlightView, BubbleView, CarryPillView, HaloView, TapRingView}.cs`. Copy 04 §12.4 goldens into
  `Golden/routes_golden.json` (regenerate with `Tools/golden/c04/routes.mjs`).
* **Content:** chief (stick, collision with the landing land built before his first move, facing, walk/carry anims with
  timeScale, footsteps + dust), carried stack (sway, bob, hop, flights, MAX), carry pill row 1, halo ring + glow with the
  generated stand-in (Phaser shows it until the first sale), residents = exactly `moveIns.start`: `npc_grandpa`,
  `npc_aunt`, `npc_kid_girl`, `npc_kid_prankster` and `pet_dog` with `JobPet` (04 §13.8), with spawn, LOD,
  stay/wander/sit/warm/read/shiver jobs and greeting, emote bubbles, customers' `MoveAgent`, ground-tap mode (§6.1)
  behind the toggle.
* **Tests (D):** 04 §21 table: dirFromVec, nearestDir, chief speeds and timeScale 1.214 / 0.899, 95 % speed after 10
  ticks, footstep 0.225 s, carry offsets, landing polygon/door/planks, `OffLand(1130, 412)` true/false(chief),
  `Shore(1130) + 46 = 426.517`, `Roads` goldens (exact points: + − × ÷ sqrt only), GridPath golden, FramePlayer: `fish`
  impact 0.3 s after Play then every 0.6 s, no impact on Play, keep phase on turn, `give` stops and restarts; GoalWalk
  arrives within gdist 8; separation +60 px/s; the §6.1 GroundTap cases. **T:** `trace_resident.json` replay
  (`ConstRandom(0.5)`): route nodes equal, positions within 0.5 px per tick, LOD switches on the same tick ± 1.
* **Verify:** D, P (a 600-frame scripted walk does not leave the land), T; **Ph: walking feel; 4 residents and the dog
  visible walking in the first minute (compare 2–3 runs with Phaser, 04 §21 soft check); tap-to-walk feel.**

### WP-7 — See-through buildings (1.5 days)

* **Files:** Core `Render/{Occlusion, OccMask}.cs`; Game `Render/OccluderView.cs` (alpha write); Editor
  `Bake/OccMaskBaker.cs` → `Generated/Occlusion/*.occ.bytes`.
* **Tests (D, with the baked masks as input):** shop box X 1274.0, Hw 194, Top 218.5, Big true; chief at (1274, 700)
  behind the shop → want 0.32 within 0.1 s, alpha 0.32 after 20 ticks at dt 1/60, front and sign fade too; only one of three
  points opaque → no fade (big); a customer behind a pine → fades; the grill never registers.
* **Verify:** D; **Ph: walk behind the hut, the stall and pines; compare the fade with Phaser.**

### WP-8 — Opening loop (5 days; 8a = Core part, Track C)

* **Files (Core):** `Loop/{PadArea, FishingDeck, Station, OperatorSpot, Shop, Lane, Customer, Register, CashPad, Economy,
  UnlockPad, Progression, Tutorial, Clerk, Cook, SliceEnd}.cs`, `Game/{GameSim, GameBuild, ArrowBot, DebugApi}.cs`; Game
  `Render/{PadView, StackView, LabelView, ArrowView, FloatTextView}.cs`, `UI/{Hud, CoinCounter, CoinFlyer, ObjectivePanel,
  EdgeArrow, Toasts, Banners, PopChip, InactiveHudButtons}.cs`, `Audio/AudioService.cs` (the 06 §14 sfx list),
  `Platform/Haptics.cs`.
* **Rules:** run as Phaser `?onboard=0&flagmaker=0` (06 L6): tutorial arrow + objective panel, no flag maker, no Act 1;
  timers ported literally (06 L3); clerk and cook walk to their posts (SLICE-should, cheap); customers take their look
  from `villager_a/b/c` + every loaded villager look not in use (`customerKeys`, A23); the fisher pad is a stub that
  marks `hire_fisherman` done and ends the tutorial (06 Q4 default), then **`SliceEnd`**: one banner
  「여기까지가 시험판이에요」 and no later pads (`SyncPads` shows no row after the stub; Phaser's next rows `raw_grill` 70,
  `porter_grill` 100, `zone_forest` 90 would otherwise appear and do nothing). Haptics: Android JNI
  `Vibrator`/`VibratorManager` with `VibrationEffect.createOneShot(ms, DEFAULT_AMPLITUDE)` (API ≥ 26, else
  `vibrate(long)`), `VIBRATE` permission (a never-called `Handheld.Vibrate()` reference or a manifest snippet), nothing
  in the editor, respects the sound/vibration setting. The font (A10) is fixed before this package starts.
* **Tests (D, dt 1/60, seeded):** 06 §19 A1–A14 (new-game state; arrow `obj_fish` at (1089, 376) h 6; no fishing from the
  spawn; 6 fish by ≈ 3.7 s; refills; hand-overs every 5 frames; chief cooks one per 39 frames, cook 48–49; sale → till
  12 coins after 200 ms, `firstSale`, clerk pad 700 ms later; register pays within 0.25 s, next ≥ 0.35 s; till collect;
  pad drain 12/s after 0.5 s; needsLeave; line cap 10; save/load round trip of the loop fields; after the stub no pad
  row is visible). **T:** `trace_loop.json` replay (scripted input, `ConstRandom(0.5)`): per tick chief x/y within
  0.5 px, dir, anim key and frame index, stack contents, grill timers and stacks, shelf, till, coins, queue states,
  camera target; event ticks (impacts, hand-overs, sale) equal ± 1 frame. **A15:** `ArrowBot` (port of
  `tools/test/onboarding.mjs` 120–260) makes the first sale; assert against the WP-R reference for `?onboard=0`.
  Track C's WP-8a is done only when the trace replay is green.
* **Verify:** D, T; P (60 s of bot play renders without errors); **Ph: play the loop by hand; coins on the HUD.**

### WP-9 — Save and load of the slice's own saves (2 days; 9a = Core part, Track C) — M1a

* **Files (Core):** `Save/{SaveConst, JsNumber, JsJsonWriter, JsJson, KvStore, SaveService, Sanitize (slice fields),
  SaveModel, GameSerializer, Settings}.cs`; Game `Save/{FileKvStore, SaveDriver}.cs`, `UI/{HoldModal,
  SettingsPanel}.cs`; Editor `Menu/SaveTools.cs` (kv folder, clear). Golden: `save_golden.json` (number/string vectors,
  head order, loop-field round trips).
* **Tests:** 07 T1 number writer + the new vectors (`0.7999999999999999`, `1e-7` → `1e-7`, `0.00001`, `1.5e-6` → `0.0000015`, `2**53+2` →
  `9007199254740994`, `123456789012345680`, `1e21` → `1e+21`, `-0` → `0`, `1e400` parse → ∞ → written `null`, a U+2028
  string written raw, a lone surrogate written `\udxxx`); head order; round trip; hold/guard behaviour; culture test
  under `tr-TR`/`de-DE`. E: `FileKvStore` atomic replace in a temp folder; **the same Core T-suite also runs in Unity
  EditMode (E)**, not only D. Device: self-test (9) on IL2CPP.
* **Verify:** D, E; **Ph: 07 §12.4 S-1, S-2.**

### WP-9b — Old-save chain and 마을 옮기기 (3 days; Core part Track C) — M1b

* **Files (Core):** `Save/{Migrate, Sanitize (full, 07 §7 + Appendix A pass-through), Remap43, Check43, Transfer, Crc32,
  Base64Url}.cs`; Game `UI/MoveImportPanel.cs`, `Debug/DevFixtures.cs`; Editor `Menu/SaveTools.cs` (Load Fixture…).
  Golden: `save_code_v4202_25min.txt`, the 33 fixtures.
* **Tests:** 07 T2–T12 (D and E): `newerMatrix`, MIGRATE vectors, sanitize hostile/empty, every fixture's result kind
  and fields, the 6 full outputs (`sameJSON`, then text equality), `Remap43` idempotence, CRC32/base64url/`tinyJ` exact,
  decode cases, `ApplyVillage` with a failing store. Device: the self-test decodes and re-encodes `v4202_25min` on
  IL2CPP and compares the text.
* **Verify:** D, E; **Ph: 07 §12.4 S-4, S-5** (S-3 with WP-10).

### WP-10 — An old village shows its layout (5 days, incl. Tier B+) — M1b

* **Files:** Core `World/{SiteModel, ZoneState}.cs` (+ Territory region opening: fog rebuild, bounds, walk rects, region
  objects), Game `Render/{SiteView, ExteriorView}.cs`; Editor RoadMaskBaker for every zone and region overlay;
  `Tools/slice_assets.txt` += Tier B+ (§5.3; `ArtSync` lists the pages the closed-exterior layers reference and fails
  on a missing one).
* **Content:** after load: open regions (fog, camera bounds, region trees/decor/roads), unlocked zones (floors, overlays,
  zone fences/decor/trees, outline removed, worker huts), sites as foundation/scaffold/done with the 03 §5.10 pictures
  and depths, **the rail station, town hall, big restaurant, chief office, bank and depot as closed exteriors from
  Tier B+** (03 §5.10 layers in manifest `drawOrder`, `base + 0.01·i`), shop stage 2–3 drawn with stage-1 rules on
  that stage's points (06 Q3 default), clerk/cook at posts, chief at the remapped spot (370, 680); residents with their
  own looks (Tier A+), workers' 2nd/3rd looks (Tier B+).
* **Tests:** D: fixture `v4202_25min` → 6 sites at the 07 S-3 positions; camRect with east + rail open; `life.moved` keys
  kept; fixture **`v43a3_late`** → hall, restaurant, office, bank, depot placed at their plots with no placeholder. P:
  overview shots of both loaded villages to `ci/shots/v4202.png`, `ci/shots/v43a3_late.png`; a test fails on any
  placeholder sprite in them.
* **Verify:** D, P; **Ph: S-3 — paste the code from `save_code_v4202_25min.txt` and the designer's own code; card shows
  1,034 코인 · 주민 26명 · 1일째 · 건물 6채; the village matches the WebView app's (daytime), except the agreed list of
  §5.3 (rails/street art, town people, interiors).**

### WP-11 — Presets, frame governor, sound, go/no-go build (2 days) — end of M1a

* **Files:** Game `Platform/{DeviceFacts, PerfApplier}.cs`, `Debug/{DebugMenu, PerfOverlay}.cs` (fps, frame time,
  **batches**, `SetItem` p95); Core `View/PerfPresets` (auto pick, step-down watcher 01 §5.4 with thresholds logged, not
  trusted); targetFrameRate rules; ambience + music; settings panel (「탭해서 걷기」, 「그래픽」, 「처음부터」, dev:
  「시험 마을 불러오기」, 「성능 정보」, 「Phaser 저사양처럼」 = 30 fps + render scale `1/devPerLogical` for the feel pass;
  「마을 옮기기」 arrives with M1b).
* **Acceptance (proposed targets, adjust after the first measurement):** 10 minutes on the designer's phone and on one
  low phone (Mali-G52 class) with the auto preset: no stretch below 30 fps longer than 1 s; batches at the start view
  ≤ 150; total PSS from `adb shell dumpsys meminfo com.snowbloom.village.slice` recorded and under 400 MB; the save
  survives a kill; one measurement with `[Vulkan, OpenGLES3]` on the designer's phone (keep GLES3-only unless Vulkan is
  clearly better and stable).
* **Verify:** B, **Ph (go/no-go session, §10.2 protocol and checklist).**

### WP-12 — Act 1 coach cards (SLICE-should, 2 days, after M1a)

All of 06 §13.2–13.7 or nothing (06 R10): derive, dwell/back/short rules, laps, fish cap, views, coach card, skip chip,
held banners. Tests: the A15 bot with Act 1 on must land the first sale in 15.8 ± 1.0 s (Phaser 15.7–16.1 s).

### WP-R — Phaser references (cloud session, Linux, Playwright; day 1–2, 2.5 days, parallel to WP-0)

Done in a cloud Claude session on the Phaser repo (read-only use of the game; outputs go to the new Unity repo).
All captures use `tools/test/fv_step.mjs` (loop asleep, `game.headlessStep(T, 1000/60)`, `Date.now` in step,
`window.__FV.scene`), `?onboard=0&flagmaker=0`, 저사양 **off** (high preset: full-resolution art and the full object
set; the living-water objects of the WATER band are left out of every comparison because the slice draws the old sea,
K11), a fresh browser profile (saved zoom 1.2), `Math.random` pinned to the constant 0.5 (the Unity side uses `ConstRandom(0.5)`; if any
rejection loop hangs under the constant, that call site gets a fixed cycling sequence on both sides, listed in the
trace header), 720×1280.

1. `Golden/displaylist_newgame.json`: at t = 0 and t = 5 s, `scene.children.list` in draw order: texture key, frame,
   x, y, depth, flipX, scaleX, scaleY, alpha, visible, and container children (with their own fields).
2. `Golden/trace_loop.json`: `Input.override` driven by a scripted path (walk to the reel spot, wait, the work spot,
   the output pad, the shelf, the register, the till); per tick: chief x, y, dir, anim key and frame index, stack
   contents, grill timers and stacks, shelf, till, coins, queue states, camera target; plus the event list (impacts,
   hand-overs, sale) with ticks.
3. `Golden/trace_resident.json`: one resident's route from a fixed start with the constant randomness: per tick x, y,
   dir, anim, route node, LOD state.
4. `Docs/Reference/`: the new-game start view; the chief behind the stall; the `v4202_25min` and `v43a3_late` villages
   in overview (daytime); a 60-s walk video; the first-sale time of the existing onboarding bot with `?onboard=0` over
   5 seeds (closes 06 Q2).

The traces are the oracles for WP-4 (display list), WP-6a (resident) and WP-8a (loop); spec tables stay as unit tests.

### 8.1 Slice exit criteria (the designer's request, line by line)

| Request | Milestone | Where | Check |
|---|---|---|---|
| New game → village exactly as in Phaser (ground, roads, buildings, draw order) | M1a | WP-3, WP-4 | display-list replay (T) green; `newgame.png` vs WP-R reference; designer on the phone (§10.2 look pass) |
| Buildings see-through when walking behind them | M1a | WP-7 | designer walks behind the hut, stall, pines |
| Joystick and tap-to-walk; camera follows; pinch zoom in the same range | M1a | WP-5, WP-6 | 0.6–1.7 player range, centre-fixed pinch; ground-tap mode (toggle) |
| 2–3 residents walk | M1a | WP-6 | the 4 `moveIns.start` people and the dog visible within the first minute |
| Opening loop: carry to the stall, first sale gives coins, HUD shows coins | M1a | WP-8 | A1–A14 and the loop trace (T) green; designer plays it |
| Save and load | M1a | WP-9 | S-1, S-2 |
| An existing v4.x save loads and shows its layout | M1b | WP-9b, WP-10 | S-3 card and village (incl. Tier B+ exteriors), S-4, S-5 |

### 8.2 Schedule (re-baselined in revision 2)

Revision 1 summed to ≈ 23–24 Claude days and already said that this exceeds the Korean plan's 2–3 weeks. Compared with
the class lists inside each package that was optimistic (WP-4, WP-6, WP-8 hold 15–25 classes each), and it had no
room for the critique fixes (traces, Tier A+/B+, ground-tap mode, JS number writer, TMP/haptics/clipboard checks).

| WP | R | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 11 | **M1a** | 9b | 10 | **M1b** | 12 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Rev 1 | – | 1.5 | 1 | 2 | 2 | 3 | 1.5 | 3 | 1 | 3 | (2.5) | 1.5 | ≈ 19 | (in 9) | 2 | ≈ 4.5 | 2 |
| Rev 2 | 2.5 (cloud, parallel) | 2 | 1 | 2.5 | 2.5 | 5 | 2 | 5 | 1.5 | 5 | 2 | 2 | **≈ 30.5** | 3 | 5 | **≈ 8** | 2 |

* **Single Claude session on the PC:** M1a ≈ 30 days ≈ 6 weeks; M1b ≈ 8 days ≈ 1.5–2 weeks more.
* **Two sessions (Track C beside Track U):** ≈ 8–9 days of Core work (WP-1, 6a, 8a, 9a, 9b Core) leave the critical
  path: M1a ≈ 22–24 days ≈ **4.5–5 weeks**; M1b ≈ **+1.5–2 weeks** (WP-9b Core can finish during M1a, so M1b is
  mostly WP-10).
* Not included: waiting for the designer's phone checks (about 6 short sessions of 15–30 min), first-day installs.
* **Option B** (one milestone, if the designer prefers it; saves ≈ 6–7 days): drop halo, carry pill and emote bubbles
  (04 SLICE-opt); place clerk and cook at their posts (no walking); one fixed preset (60 fps, render scale from a
  fixed k; no auto pick, step-down watcher, perf overlay or JNI device facts); Core tests only under dotnet for the
  first build (EditMode for Unity-side tests only; the save T-suite still runs in E before the go/no-go build);
  Check43/Check43b replaced by the golden-output tests; editor menu instead of the in-app fixture list; GoalWalk
  without detour/side-step (route + 7 s give-up).
* The first message to the designer states the M1a/M1b split and these numbers (README_ko.md says it in plain Korean).

---

## 9. Driving Unity from PowerShell

### 9.1 `Tools/ci.ps1`

```powershell
param(
  [ValidateSet('setup','compile','editmode','playmode','android','windows','install','publish','shot','logcat','dotnet')]
  [string]$Task = 'compile',
  [string]$Project = 'D:\Work\Snowbloom\SnowbloomUnity',
  [string]$Out = 'D:\Work\Snowbloom\ci'
)
$ErrorActionPreference = 'Stop'
New-Item -ItemType Directory -Force $Out | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'

function Find-Unity {
  if ($env:UNITY_EXE -and (Test-Path $env:UNITY_EXE)) { $exe = $env:UNITY_EXE }
  else {
    $roots = @()
    $sec = Join-Path $env:APPDATA 'UnityHub\secondaryInstallPath.json'      # Hub -> Preferences -> Installs location
    if (Test-Path $sec) { $p = (Get-Content $sec -Raw | ConvertFrom-Json); if ($p) { $roots += [string]$p } }
    $roots += 'C:\Program Files\Unity\Hub\Editor'
    $exe = $roots | Where-Object { $_ -and (Test-Path $_) } | ForEach-Object {
        Get-ChildItem $_ -Directory -Filter '6000.3.*' } |
      Sort-Object { [version]($_.Name -replace '[a-zA-Z].*$', '') } -Descending |
      ForEach-Object { Join-Path $_.FullName 'Editor\Unity.exe' } |
      Where-Object { Test-Path $_ } | Select-Object -First 1
  }
  if (-not $exe) { throw "Unity 6000.3.* not found (UNITY_EXE, Hub install location, default path)" }
  $ver = Split-Path (Split-Path (Split-Path $exe)) -Leaf
  if ($ver -notlike '6000.3.*') { throw "Refusing Unity $ver at $exe: this project needs 6000.3.*" }
  Write-Host "Unity $ver at $exe"
  $exe
}
function Find-Adb { Join-Path (Split-Path (Find-Unity)) 'Data\PlaybackEngines\AndroidPlayer\SDK\platform-tools\adb.exe' }

function Assert-ProjectFree([string]$p) {
  $full = (Resolve-Path $p).Path.TrimEnd('\')
  $open = Get-CimInstance Win32_Process -Filter "Name='Unity.exe'" |
          Where-Object { $_.CommandLine -and $_.CommandLine -like "*$full*" }
  if ($open) { throw "Unity Editor has $full open (PID $($open.ProcessId -join ',')). Close it, or use -Project D:\Work\Snowbloom\SnowbloomUnity_ci." }
  $lock = Join-Path $full 'Temp\UnityLockfile'
  if (Test-Path $lock) {
    try { $fs = [IO.File]::Open($lock, 'Open', 'ReadWrite', 'None'); $fs.Close() }
    catch { throw "Project locked by a running Unity ($lock)." }
  }
}

function Invoke-Unity([string[]]$UArgs, [string]$Name) {
  Assert-ProjectFree $Project
  $log = Join-Path $Out "$Name-$stamp.log"
  $argLine = (@('-batchmode', '-projectPath', "`"$Project`"") + $UArgs + @('-logFile', "`"$log`"")) -join ' '
  $p = Start-Process -FilePath (Find-Unity) -ArgumentList $argLine -Wait -PassThru   # Unity.exe is a GUI app: wait explicitly
  if (Test-Path $log) {
    Select-String -Path $log -Pattern 'error CS\d+|Exception|Build (succeeded|failed)|Test run (completed|failed)' |
      Select-Object -First 40 | ForEach-Object { $_.Line }
  }
  Write-Host "$Name exit code $($p.ExitCode); log $log"
  exit $p.ExitCode
}

switch ($Task) {
  'setup'    { $yaml = Join-Path (Split-Path (Find-Unity)) 'Data\Tools\UnityYAMLMerge.exe'
               git -C $Project config merge.unityyamlmerge.driver "'$($yaml -replace '\\','/')' merge -p %O %B %A %A"
               Invoke-Unity @('-quit', '-executeMethod', 'Snowbloom.EditorTools.ProjectSetup.ApplyCli') 'setup' }   # own call: settings that need a restart
  'compile'  { Invoke-Unity @('-nographics', '-quit', '-executeMethod', 'Snowbloom.EditorTools.Ci.CompileCheck') 'compile' }
  'editmode' { Invoke-Unity @('-nographics', '-runTests', '-testPlatform', 'EditMode',
                              '-testResults', "`"$Out\editmode-$stamp.xml`"") 'editmode' }       # 0 pass, 2 failures, other = broken run
  'playmode' { Invoke-Unity @('-runTests', '-testPlatform', 'PlayMode',
                              '-testResults', "`"$Out\playmode-$stamp.xml`"") 'playmode' }       # graphics on (render tests)
  'android'  { Invoke-Unity @('-quit', '-buildTarget', 'Android',
                              '-executeMethod', 'Snowbloom.EditorTools.BuildCli.AndroidDev',
                              '-sbOut', "`"$Out\SnowbloomSlice.apk`"") 'android' }
  'windows'  { Invoke-Unity @('-quit', '-buildTarget', 'Win64',
                              '-executeMethod', 'Snowbloom.EditorTools.BuildCli.WindowsDev',
                              '-sbOut', "`"$Out\win\SnowbloomSlice.exe`"") 'windows' }
  'install'  { $adb = Find-Adb
               & $adb install -r "$Out\SnowbloomSlice.apk"
               & $adb shell monkey -p com.snowbloom.village.slice -c android.intent.category.LAUNCHER 1 }
  'publish'  { $n = (git -C $Project rev-list --count HEAD).Trim()                 # deliver to a phone that is not on USB
               $dst = Join-Path $Out "deliver\SnowbloomSlice-$n.apk"
               New-Item -ItemType Directory -Force (Split-Path $dst) | Out-Null
               Copy-Item "$Out\SnowbloomSlice.apk" $dst -Force
               if (Get-Command gh -ErrorAction SilentlyContinue) {                # private repo: prerelease asset, link printed
                 gh release create "slice-$n" $dst --repo $env:SNOWBLOOM_REPO --prerelease --title "Slice $n" --notes "dev build $n"
               }
               Write-Host "APK: $dst"
               Write-Host "휴대폰에서: 링크를 열어 내려받기 → '출처를 알 수 없는 앱 설치 허용' → 설치" }
  'shot'     { $adb = Find-Adb                                                  # binary-safe: no PowerShell redirection
               & $adb shell screencap -p /sdcard/sb_shot.png
               & $adb pull /sdcard/sb_shot.png "$Out\phone-$stamp.png" }
  'logcat'   { $adb = Find-Adb; & $adb logcat -d -s Unity | Out-File -Encoding utf8 "$Out\logcat-$stamp.txt" }
  'dotnet'   { $bad = Select-String -Path "$Project\Assets\_Snowbloom\Scripts\Core\*.cs" -Recurse `
                 -Pattern '\((int|long|uint|ulong|short)\)\s*(\(|Math\.|[a-z_]\w*\s*[\*/+-])' |
                 Where-Object { $_.Path -notlike '*JsMath.cs' -and $_.Line -notmatch '//\s*int-ok' }
               if ($bad) { $bad | ForEach-Object { "$($_.Path):$($_.LineNumber): $($_.Line.Trim())" }; throw 'double->int cast outside JsMath (§2.3)' }
               dotnet test "$Project\DotnetTests\Snowbloom.Standalone.sln" -c Release `
                 --logger "trx;LogFileName=core-$stamp.trx" --results-directory $Out
               exit $LASTEXITCODE }
}
```

(The cast check is a heuristic: it flags casts applied to arithmetic or `Math.*` results; a proven-integral cast is
allowed with a trailing `// int-ok` comment. `Select-String -Recurse` needs PowerShell 7; with Windows PowerShell 5.1
use `Get-ChildItem -Recurse -Filter *.cs | Select-String`.) `publish` needs `$env:SNOWBLOOM_REPO` (the private
`owner/SnowbloomUnity`, §11) and a logged-in `gh`; without them it only copies the APK to `ci\deliver\`, and the human
sends that file to the phone (Google Drive or a chat app's "send to myself"). The Play upload key is never used (A14).

Usage: `powershell -ExecutionPolicy Bypass -File D:\Work\Snowbloom\SnowbloomUnity\Tools\ci.ps1 -Task editmode`.
Optional filters for test runs: add `-assemblyNames Snowbloom.Core.Tests` or `-testFilter <regex>` to the Unity arguments.
The first batch run imports the whole project (several minutes): run it in the background and poll the log.

### 9.2 Editor-side entry points

```csharp
namespace Snowbloom.EditorTools {
  public static class Ci {
    public static void CompileCheck() => EditorApplication.Exit(EditorUtility.scriptCompilationFailed ? 1 : 0);
    // if Snowbloom.Editor itself fails to compile, Unity reports the missing method and exits non-zero: same signal
  }
  public static class BuildCli {
    public static void AndroidDev() {
      var diff = ProjectSetup.Diff();                                      // never Apply() here: colour space / input handler /
      if (diff.Count > 0) { foreach (var d in diff) Debug.LogError("[setup] " + d);   // API level need a reimport or restart
                            EditorApplication.Exit(1); return; }           // -> run `ci.ps1 -Task setup` first
      EditorUserBuildSettings.buildAppBundle = false;                       // APK for adb install
      int n = GitInfo.CommitCount();                                       // git rev-list --count HEAD
      PlayerSettings.Android.bundleVersionCode = n; PlayerSettings.bundleVersion = "0.1." + n;
      var r = BuildPipeline.BuildPlayer(new BuildPlayerOptions {
        scenes = new[] { "Assets/_Snowbloom/Scenes/Boot.unity", "Assets/_Snowbloom/Scenes/Village.unity" },
        locationPathName = CliArgs.Get("-sbOut", "Builds/SnowbloomSlice.apk"),
        target = BuildTarget.Android, options = BuildOptions.Development });   // signed with Unity's debug keystore
      EditorApplication.Exit(r.summary.result == BuildResult.Succeeded ? 0 : 1);
    }
    public static void WindowsDev() { /* same with BuildTarget.StandaloneWindows64 */ }
  }
}
```

Other batch methods: `Snowbloom.EditorTools.ArtSync.CopySlice -sbPhaser <path>`, `CatalogBuilder.Rebuild`,
`RoadMaskBaker.BakeAll`, `OccMaskBaker.BakeAll`, `FontPrewarm.Build`, `ProjectSetup.ApplyCli` (each ends with
`EditorApplication.Exit(0|1)`; call with `-quit -executeMethod …`).

### 9.3 Typical loop for Claude on the PC

1. Edit Core → `ci.ps1 -Task dotnet` (seconds; no editor needed, works while the editor is open).
2. Edit Game/Editor → `ci.ps1 -Task compile` → `-Task editmode` → `-Task playmode` (editor must be closed, or use 9.4).
3. `ci.ps1 -Task android` → `-Task install` (phone on USB) → `-Task shot` (Claude reads the PNG) → `-Task logcat`.
4. For the designer's phone: `ci.ps1 -Task publish` and send the printed link/file.
5. Hand over to the human only for feel and look (the **Ph** items).
6. After changing anything `ProjectSetup` owns: `ci.ps1 -Task setup` (its own Unity run) before the next build.

### 9.4 When the editor is open

Batchmode cannot open a project that a running Editor holds (`Temp/UnityLockfile`); `ci.ps1` refuses instead of
waiting. Options: (a) the human closes the editor; (b) a second checkout for batch work:
`git -C D:\Work\Snowbloom\SnowbloomUnity worktree add D:\Work\Snowbloom\SnowbloomUnity_ci HEAD` (it builds its own
`Library` once; update with `git -C ..._ci checkout --detach <commit>`), then `ci.ps1 -Project
D:\Work\Snowbloom\SnowbloomUnity_ci`; (c) the human presses Run All in the editor's Test Runner. `dotnet` runs are never
blocked.

---

## 10. Risks and what the designer judges

### 10.1 Risks (consolidated; spec references in brackets)

| # | Risk | Mitigation |
|---|---|---|
| K1 | **The spec workspace is a temporary folder.** The golden files (02 static JSON, 07 golden, routes) exist only there; the generator for the 02 static JSON was not kept (07/04/06 generators were). | WP-0 first step: the cloud session copies `specs/` and the generator scripts into the new repo (`Docs/PortSpecs`, `Golden`, `Tools/golden`) and pushes; rewrite the 02 generator (Node: import world.js + copies of buildFences/buildTrees/blockedForDecor/pathDecor) before world.js changes again. |
| K2 | Depth parity: a missed offset or Seq bump changes overlaps (03 R1/R2/R13) | P1 rank with double depth; every entry created through one `WorldViews.Create(…)` that registers its key; P tests on known pairs; designer comparison |
| K3 | Y flip and JS rounding (01 R1/R2) | sim in px y-down; `WorldSpace` only converter; `JsRound` only rounding; D tests |
| K4 | Pivots and flips of trimmed frames (03 R4/R5, 05 R3/R4) | `PivotMath` + `flipShift` only, unit-tested against the tables |
| K5 | Gamma colour space unavailable or deprecated for URP 2D in 6.3 (05 R9) | WP-0 gate (A5): deprecation check, Gamma + Linear screenshots for the designer, decision recorded; alpha constants in `LookConstants` so a Linear retune is one file |
| K6 | URP 2D Renderer ignores Render Scale (01 R8) | WP-0 self-test with a 1-px checker read back (observable effect, not a buffer size); fallback `Screen.SetResolution` on Android (scales the HUD too) |
| K7 | `DeflateStream` on IL2CPP Android (07 R4) | WP-0 self-test; fallback port of `inflate.js` |
| K8 | Frame timing feel: Unity's raw delta vs Phaser's 10-sample smoothing; Android 30-fps default (01 R6/R7) | `FrameClock` port; `targetFrameRate` set explicitly; frame-quantised timers kept literally (06 L3) |
| K9 | Animation-driven gathering and impact timing (06 R2, 04 R3) | Core `FramePlayer` with D tests on impact counts at dt 1/60 and 1/30 |
| K10 | A* tie-breaking differs → other streets (04 R8) | exact heap port; route goldens |
| K11 | The old sea equals Phaser only on 저사양; high/mid phones show the living water (02 R10) | compare on 저사양; Shader Graph water is LATER |
| K12 | ASTC artefacts on palette art (05 R7) | phone check in WP-4; fall back to 4×4 or RGBA32 for icons |
| K13 | Korean text look: the phone shows a system font, not Pretendard; SDF padding too small for the strokes | A10: font chosen from a screenshot on the designer's phone (default Noto Sans KR Bold/Black); padding 13 at 64, stroke material presets, self-test (5) |
| K14 | Tap-to-walk semantics differ from Phaser (01 R14) | toggle; designer decides the default |
| K15 | Residents appear at t = 0 in Unity, a few seconds late in Phaser (04 R12) | accept; mention to the designer |
| K16 | Save text differences break the WebView app (07 R1–R3, R7) | JS number writer, head order test, pass-through, `lv` discipline; load Unity-written saves back through the C# sanitizer in tests |
| K17 | Low-end performance and thermal (Mali-G52 class): P1's interleaved textures can cost 150–400 batches; full-screen blended ground layers overdraw | batch gate ≤ 150 at the start view (WP-4/WP-11) with the offline world-atlas repack as the fix; sea/land may use `Blend Off`; static views without `Update`; Backdrop camera only with bars; preset auto-pick; WP-11 10-minute run; autosave I/O measured |
| K18 | Package versions: URP/uGUI/Test Framework are editor-locked; a hand-typed version breaks resolution | keep the template's versions; commit `packages-lock.json` |
| K19 | Unity Personal licence in batchmode / CI | licence activated in the Hub on the PC; GitHub Actions runs only the dotnet tests |
| K20 | The schedule: revision 1's ≈ 23 days did not fit 2–3 weeks and was optimistic | re-baselined (§8.2): M1a ≈ 4.5–5 weeks with two sessions, M1b ≈ +1.5–2 weeks; option B cut list; told to the designer in the first message |
| K21 | Float→int casts and libm differ between dotnet x64, the editor and IL2CPP ARM64 (saturation, last-ulp trig, FMA) | `JsMath.ToInt32/ToUint32/ClampToLong` + the cast grep check; exact goldens only for IEEE-exact operations (§2.3) |
| K22 | Device locale (de-DE, tr-TR …) changes number/text formatting and could corrupt saves | invariant culture at boot and in tests; ordinal comparisons; locale test (§2.3) |
| K23 | Old villages need late art Phaser fetches on demand (hall, restaurant, office, bank, depot, station) and ≈ 25 villager looks | Tier A+ (M1a) and Tier B+ (M1b) (§5.3); `v43a3_late` fixture test fails on any placeholder |
| K24 | Getting builds onto the designer's phone, which is not on the PC | `ci.ps1 -Task publish` (private release asset or a file to send); one hello-world install in WP-0 |
| K25 | A spec misread passes its own tests | WP-R display list and traces (A22) as oracles; Track C packages are done only when their replay is green |

### 10.2 What the designer judges on the phone, and how to compare

**Comparison protocol.** Phaser's 저사양 changes far more than the sea (`src/core/Perf.js:43`: `maxK 1`, `texScale 0.5`
= every atlas page at half resolution, `groundLow`, 30 fps, MSAA off, snowfall 0.3×), the WebView app cannot take
`?onboard=0&flagmaker=0` (a new game there shows the Act 1 coach cards and the flag maker, `Game.js:267, 270`,
`Onboarding.js:33–44`), and the saved zoom survives 「처음부터」 (`Settings.zoom`, `Game.js:362–363`). So:

| Pass | Phaser side | Unity side | Notes for the designer |
|---|---|---|---|
| Look (J1–J3, J9) | the Phaser play link in Chrome on the same phone with `?onboard=0&flagmaker=0`, 설정 › 그래픽 › 저사양 (old sea), in a fresh browser profile/incognito tab so the zoom starts at 1.2 | normal build | Phaser will look **softer** (half-resolution art on 저사양); compare shapes, places, order and fades, not sharpness |
| Feel (J4, J5, J8) | Phaser on the designer's usual preset (60 fps; the sea differs, accept it) | normal build; optional dev toggle 「Phaser 저사양처럼」 (30 fps + render scale `1/devPerLogical`) for a like-for-like check | judge joystick, camera, loop timing |
| If the WebView app is used anyway | press 「건너뛰기」 on the first coach card, close the flag maker, clear the app data first so the zoom is 1.2 | — | |
| Loaded villages (J11) | compare during the **day** (Phaser runs the day/night clock with a night overlay; the slice keeps it day) | — | |

| # | Look at | Pass when |
|---|---|---|
| J1 | Start view of a new game | same framing (985, 600) at zoom 1.2; same trees, fences, roads, rim, plaza edge, stall sign; nothing missing or extra |
| J2 | Draw order | walking around the hut, grill, stall, deck and pines: the chief is in front/behind exactly where Phaser puts him |
| J3 | See-through | the hut, stall and pines fade when he is behind them, about as fast as in Phaser; the grill does not fade |
| J4 | Joystick | starts where the thumb lands, same speed, up/down slower than left/right, no lag |
| J5 | Camera | follows as smoothly as Phaser; pinch zooms about the screen centre between the same closest and farthest views; letterbox bars on very tall phones |
| J6 | Tap-to-walk | a tap on the ground walks there quietly with a ring at the target; a tap on a pad walks onto the pad; a tap on the stall or a pine stops beside it; a tap on the sea shows only the toast 「지금은 갈 수 없는 곳이에요」 (`g_noWay`); a second tap re-targets; a tap on a resident talks to them; works during the tutorial with the tutorial camera; the toggle restores Phaser's behaviour |
| J7 | Residents | the 4 people of a new Phaser village (grandpa, aunt, girl, prankster) and the dog Nuri walk around the plaza within the first minute; in Phaser they appear a few seconds late (K15) |
| J8 | Opening loop | fish → grill → stall → register → till; first sale in about the same time; coins count up on the HUD; customers in many different looks; after the fisher stub one banner 「여기까지가 시험판이에요」 and no further pads (the slice ends there on purpose) |
| J9 | Text | Korean labels, objective panel, toasts and banners read as in Phaser (font shapes as on this phone, weight and outline). Known, not bugs: the whistle and goal buttons are inactive look-alikes (「준비 중이에요」); HUD icons and the chief's halo do not re-skin after the first sale |
| J10 | Save | swipe the app away and reopen: same coins, bag, chief spot |
| J11 | Old village (M1b) | the pasted code shows the confirm card and the same village layout as Phaser in daytime, with the hall, restaurant, office, bank, depot and station drawn; agreed differences: rails/street art are plain snow, town-region people absent, interiors closed |
| J12 | Smoothness | no stutter on the designer's phone and on a cheap phone; battery/heat acceptable over 10 minutes |

## 11. Open questions from specs 01–07: what this document decided

| Question | Decision here | Still for the designer? |
|---|---|---|
| Sorting scheme (02 Q1, 03 Q1, 04 C5) | P1 exact rank; characters as separate keys; SortingGroup only for containers and pad stacks | no |
| Tap-to-walk (01 Q1, 04 Q1) | ground-tap mode (§6.1: pad snap / FreeSpot, quiet walk, target ring, re-tap), toggle default on in the slice, also during the tutorial | **yes: confirm the default** |
| Zoom range / overview (01 Q2) | 0.6–1.7; overview (map button) included (cheap, and it shows a loaded village) | no |
| Letterbox (01 Q3) | copy Phaser's bars | no |
| 90/120 Hz (01 Q4) | 01 D6 mapping (60; 90 on a 90-Hz phone with the high preset) | no |
| Reload-only graphics knobs (01 Q5) | apply live; drop the reload note | no |
| Water (02, 05) | old sea in the slice; compare on 저사양 | **yes: is that acceptable for go/no-go?** |
| Colour space (02, 05) | Gamma for the slice behind the WP-0 gate (A5); Linear screenshot shown too | informational (both screenshots) |
| Layout source (02) | `world_static.json`; generators later with the JSON as oracle | no |
| Rail-strip rails/streets in old saves (02) | plain snow + a note; the late buildings themselves are drawn (Tier B+, §5.3) | **yes: agree before WP-10** |
| Village flag (02) | baked banner on the pole | no |
| Trimmed frames (02, 05) | keep trimmed frames, pivots converted at runtime | no |
| Pad-stack draw order (03 Q2) | item-index order (Phaser's baked look) | no |
| Cutaway buildings (03 Q3) | closed exteriors only | no |
| Offline masks (03 Q4) | yes | no |
| Frame-rate-dependent fades (03 Q5) | keep Phaser's formulas | no |
| Residents' delay (04 Q2) | none; cast = the 4 people + dog of `moveIns.start` (A23) | no |
| Halo art (04 Q3) | generated stand-in (what Phaser shows before the first sale); real `chief_fx` art LATER, so after the first sale the ring looks different from Phaser | yes (informational) |
| Chat bubbles (04 Q4) | emote-only | no |
| Navigator in loaded saves (04 Q5) | absent in the slice | no |
| Residents in view (04 Q6) | Phaser parity | no |
| Hire flow art (05) | Tier A + A+ + B are loaded with `Village.unity`, so the clerk/cook art is available | no |
| ASTC block size (05) | per 05 §15.1; phone check in WP-4 | no |
| Editor workflows (05) | LATER (option (b) slicer must reuse `PivotMath`) | no |
| Font (05, A10) | the phone's real font (default Noto Sans KR Bold/Black), chosen from a screenshot; Pretendard only as a design choice | **yes: confirm from the WP-0 screenshot** |
| Title screen (05) | none | no |
| Act 1 coach cards (06 Q1) | WP-12, after the go/no-go build works without it | **yes: needed for go/no-go?** |
| First-sale reference without Act 1 (06 Q2) | WP-R measures it | no |
| Shop stages 2–3 in old saves (06 Q3) | stage-1 rules on the stage's points | no |
| Fisher hire (06 Q4) | stub that ends the tutorial | no |
| Flag maker (06 Q5) | skipped | no |
| Separate package (07 Q1) | `com.snowbloom.village.slice` | no |
| Non-slice sanitizers (07 Q2) | blocks kept verbatim | no |
| Hold UI (07 Q3) | one modal + 「새 마을로 시작」 | no |
| Export codes (07 Q4) | LATER, right after the slice | no |
| Where the Unity repo lives | `SnowbloomUnity` = new repo; owner/org to be created (plan doc decision 2–3) | **yes: create the private repo/org** |
| Milestones (A21) | M1a (items 1–5) then M1b (old village); option B listed | **yes: confirm before WP-0** |
| After the fisher stub | `SliceEnd` banner, no later pads | no (informational, J8) |
| HUD extras (whistle, goal window, re-skin) | inactive look-alikes; no re-skin | no (informational, J9) |

---

## 12. Where this differs from the Korean plan (`frost-village/docs/기획서_유니티전환_팀협업_작업계획.md` §4)

| Plan says | This document | Why |
|---|---|---|
| Scripts by feature (Core/Data/Systems/Entities/UI/Save) | by assembly (Core = simulation, Game = views, Editor = tools), feature folders inside | the simulation must compile without Unity for headless tests |
| Sorting Group + iso Y sort | exact rank (§4.1) on the Default sorting layer | Y sort cannot express Phaser's offsets and ties |
| See-through rebuilt as a shader | alpha fade with baked masks | Phaser fades the whole sprite; no shader needed |
| Atlases converted to Unity Sprite Atlas | runtime `Sprite.Create` from the Phaser JSON | 596 out-of-range pivots, `tfatlas`, zero metadata to sync |
| Addressables for lazy loading | everything loaded with `Village.unity` in the slice | ≈ 55 MiB (M1a) / ≈ 66 MiB (M1b) ASTC; Addressables LATER |
| Water in Shader Graph | old sea in the slice | living water LATER |
| Localization package | `strings.json` + `t()` port | same keys and fallbacks as Phaser; package LATER |
| Balance in ScriptableObjects | exported `balance.json` read by Core | one source shared with Phaser; SO editor LATER |
| DOTween for tweens | Core game-time `Scheduler` | item counts depend on flights; must pause and step with the game |
| Same JSON save | same | — |

---

## 13. Spec index

| Spec | Built in | Main Core types | Main Game types |
|---|---|---|---|
| 01 core view | WP-1, 3, 5, 11 | `Iso`, `Dirs`, `ViewMetrics`, `CameraModel`, `FrameClock`, `InputCore`, `PointerRouter`, `GoalWalk`, `PerfPresets` | `VillageCamera`, `InputRouter`, `JoystickView`, `ZoomButtons`, `PerfApplier` |
| 02 world & ground | WP-1, 4, 10 | `WorldStatic`, `JsRng`, `Shore`, `Territory`, `WorldBuilder`, `ShoreGeometry`, `FloorGeometry`, `PolylineRaster` | `GroundBuilder`, `SeaView`, `FogView`, `SnowfallFx`, `StaticPropView`, `RoadMaskBaker` |
| 03 buildings & depth | WP-3, 4, 7, 10 | `Depth`, `SortKey`, `RankList`, `StackPlace`, `Occlusion`, `OccMask`, `BuildingDefs` | `WorldImage`, `DepthSorter`, `StackView`, `DeckView`, `ShopView`, `SiteView`, `OccMaskBaker` |
| 04 characters & nav | WP-6 | `FramePlayer`, `CharacterSim`, `PlayerSim`, `ItemStack`, `Flights`, `Collision`, `Roads`, `Paths`, `MoveAgent`, `GroundTap`, `VillageLife`, `JobPet`, `Bubbles` | `CharacterView`, `FlightView`, `BubbleView`, `CarryPillView`, `HaloView`, `TapRingView` |
| 05 assets & formats | WP-2 | `ManifestMerger`, `AtlasJson`, `TfAtlas`, `PivotMath`, `CharDefBuilder`, `AnimResolver` | `FvAssets`, `FvAssetCatalog`, `FvTexturePostprocessor`, `ArtSync`, `CatalogBuilder` |
| 06 opening loop | WP-8, 12 | `FishingDeck`, `Station`, `OperatorSpot`, `Shop`, `Lane`, `Customer`, `Register`, `CashPad`, `Economy`, `UnlockPad`, `Progression`, `Tutorial`, `SliceEnd`, `GameSim` | `PadView`, `LabelView`, `ArrowView`, `SignText`, `Hud`, `CoinCounter`, `ObjectivePanel`, `Toasts`, `Banners`, `AudioService`, `Haptics` |
| 07 save | WP-9, 9b, 10 | `JsNumber`, `JsJsonWriter`, `JsJson`, `SaveService`, `Migrate`, `Sanitize`, `Remap43`, `Check43`, `Transfer`, `GameSerializer` | `FileKvStore`, `SaveDriver`, `MoveImportPanel`, `HoldModal`, `SaveTools` |

---

## 14. Critique resolution

Both critiques were checked against the Phaser source (read-only) and the specs before anything was changed. Claims
re-verified in the code: the canvas stroke styles (`Game.js:558`, `Effects.js:147`, `UnlockPad.js:43/151`,
`Staff.js:482`); 600 distinct Hangul in `strings.js`; on-demand art loading of the late buildings (`OfficeBuilding.js:96`,
`BankBuilding42.js:31`, `DepotBuilding.js:40`, `TownHall.js:13`, `RailStation.js`); the fixture census (re-measured:
`r_station` 26/27, `big_restaurant` 21, `town_hall` 17, `chief_office` 11, `bank42` 9, `depot42` 9); the customer pool
(`Seller.js:201–203, 316–320`) and the background loading of every villager atlas (`Game.js:424–479`, `Assets.js:511`);
the new-game cast (`world.js:905`, `VillageLife.js:228–245`, `popCap` base 19); `fv_step.mjs`; the 저사양 preset
(`Perf.js:43`), onboarding/flag maker/saved zoom (`Onboarding.js:33–44`, `Game.js:267, 270, 362–363`, `Save.js`
settings); no shipped font (`tools/fonts/README.txt`, `index.html:30`, `strings.js:1428`); GoalWalk's toasts and its
tutorial refusal (`GoalWalk.js:109–110, 145, 177–185, 295`); the flip rule (`Game.js:573`); the sheared stall sign
(`Seller.js:150`, `market/manifest.json`); the Culler re-append (`Culler.js:17–25`); the next-row costs (`balance.js:94–97`).
Unity-side claims were checked against the Unity 6 API surface as far as possible without an editor; where a value
depends on the exact 6000.3 build, the fix is written as a WP-0 check rather than a number.

### 14.1 `crit_unity.md` (1 BLOCKER, 7 MAJOR, 24 MINOR)

| # | Sev. | Item | Result | Where / why |
|---|---|---|---|---|
| 1 | BLOCKER | manifest "exactly this" drops modules, pins wrong Test Framework | **applied** | §1.3 rewritten as delete/add lists; every `com.unity.modules.*` kept (§4.1 uses `ParticleSystemRenderer`); editor-locked versions never typed; ProjectSetup asserts the lists |
| 2 | MAJOR | JS number writer via `ToString("R")` differs per runtime; wrong exponent rules; string escaping; `1e400` | **applied** | A13, §2.3 JSON row, §7, 07 §2.3 rewritten: own `JsNumber.Format` (ECMA `Number::toString` over a self-contained shortest-digits routine), own string escaper, Newtonsoft for parsing only, overflow → ±∞; new golden vectors; the 07 T-suite runs in Unity EditMode (E) too; IL2CPP self-test (9) and a device round trip of `v4202_25min` (WP-9b) |
| 3 | MAJOR | TMP padding 8 clips the slice's strokes | **applied** | A10, §4.6: padding 13 at sampling 64, 2048 × 4096 one-page atlas (600 Hangul verified), material presets per stroke style, frequency-ordered pre-warm, self-test (5) |
| 4 | MAJOR | Gamma is legacy in Unity 6 | **applied, modified** | A5, §4.3, K5: WP-0 checks the deprecation status, runs Gamma and Linear, shows both screenshots, records the decision; alpha constants in `LookConstants`. Rejected part: switching the slice to Linear merely because Gamma is *flagged* deprecated — the slice is the parity test, so it keeps Gamma while Gamma works and the full-port decision is recorded instead |
| 5 | MAJOR | `Generated/` textures get Unity's default import | **applied** | §4.4, §5.2 Rule 2 (data import: sRGB off, NPOT none, no mips, RGBA32), WP-2 EditMode test |
| 6 | MAJOR | TMP Essentials (`Resources/`) forbidden by the folder rule | **applied** | §1.2 rule rewritten (allowed `Assets/TextMesh Pro/`, `Assets/Settings/`), WP-0 import step, TMP Settings (`useModernHangulLineBreakingRules`, default font), self-test (5), template input-actions asset deleted |
| 7 | MAJOR | P1 interleaving may cost hundreds of batches on the low phone | **applied, modified** | §4.3 batch gate, WP-4 gate, WP-11 overlay, K17; offline world-atlas repack as the remedy; `Blend Off` option for sea/land. Budget set to ≤ 150 (not 120) as a first target to be re-set after the first measurement |
| 8 | MAJOR | double→int casts and libm differ dotnet / editor / IL2CPP | **applied** | §2.3 "Double → integer" and "Determinism" rows, `JsMath.ToInt32/ToUint32/ClampToLong`, cast grep in `ci.ps1 -Task dotnet`, A15 wording, WP-1 tests, K21 |
| 9 | MINOR | culture not forced | **applied** | §2.3 Culture row, locale test, K22 |
| 10 | MINOR | TMP sub-meshes ignore direct `MeshRenderer.sortingOrder` | **applied** | §4.1 `TmpTarget` |
| 11 | MINOR | 3D `TextMeshPro` size ×0.1 | **applied** | §4.6 World text (`isOrthographic = true`, `px / 64`, P test) |
| 12 | MINOR | touches processed downs-then-ups | **applied** | §3.2, §6 `InputRouter` time-ordered list, WP-5 tests, 01 §4.3 banner |
| 13 | MINOR | Device Simulator has no multi-touch; `IsPointerOverGameObject`; `StandaloneInputModule`; wheel ±120 | **applied** | §6 (debug pinch, override note, EditMode scan, sign-only wheel); 01 §4.3 and R12 annotated |
| 14 | MINOR | obsolete ProjectSetup APIs; settings applied inside the build | **applied** | WP-0 ProjectSetup (`NamedBuildTarget`, `defaultRenderPipeline` + per-quality, `VersionControlSettings.mode`, `SetUseDefaultGraphicsAPIs`, build scenes), `ci.ps1 -Task setup`, `BuildCli` asserts via `ProjectSetup.Diff()` |
| 15 | MINOR | Android min/target API, GLES3 + Vulkan order, GameActivity | **applied, one part rejected** | A19, WP-0: `max(24, floor)`, target = highest installed platform, `[OpenGLES3]` only + one Vulkan measurement in WP-11, activity via `UnityPlayer.currentActivity`. Rejected: adding `-accept-apiupdate` — that flag runs the script API updater; it does not accept SDK licences |
| 16 | MINOR | .NET 8 out of support; `.slnx` default | **applied** | A15, §2.4 (`net10.0`, `dotnet new sln --format sln`, `setup-dotnet 10.0.x`), WP-0 install line (today is after .NET 8's 2026-11-10 end of support) |
| 17 | MINOR | test assembly names, polyfill clash, API surface | **applied** | §2.4 `AssemblyName`, no records/`init` in test code, `ApiCheck` compile-only project |
| 18 | MINOR | catalog loads with Boot; statics survive reloads | **applied** | §3.3: Boot reference-free + `LoadSceneAsync`, catalog in Village, `Reset()` on `SubsystemRegistration`, idempotent `Init`, boot-twice PlayMode test |
| 19 | MINOR | runtime `renderScale` writes the URP asset | **applied** | §4.2 runtime clone, WP-3 P test |
| 20 | MINOR | Backdrop camera always on | **applied** | §3.3, §4.2: active only with bars |
| 21 | MINOR | postprocessor details | **applied** | §5.2 and 05 §15.1: IHDR sizes, `ground_road\.png` regex, quality 50/100 + Parallel Import, audio sample settings |
| 22 | MINOR | additive sprites need a shader; no `Shader.Find`; mobile precision | **applied** | §4.3 (`SB_SpriteAdditive`, `Materials.asset`, `float` UV/time terms, CPU `frac`) |
| 23 | MINOR | particle sort mode | **applied** | §4.1 table (`YoungestInFront`, billboard/view, world space) |
| 24 | MINOR | `Handheld.Vibrate` has no duration | **applied** | WP-8 `Haptics` (JNI one-shot), A19 `VIBRATE`, self-test (8) |
| 25 | MINOR | clipboard paste not self-tested | **applied** | §7 JNI fallback, self-test (7) |
| 26 | MINOR | fsync on the main thread every 5 s | **applied (measure first)** | §7 When row: p95 measured in WP-11; background write only if > 4 ms |
| 27 | MINOR | render-scale self-test not observable | **applied** | WP-0 self-test (2) checker readback, K6 |
| 28 | MINOR | sorting layer "World" needs TagManager surgery | **applied** | A3, §4.1: built-in `Default` layer |
| 29 | MINOR | `Dictionary` order ≠ JS insertion order | **applied** | §2.3 Iteration order row (`OrderedMap`), WP-1 test |
| 30 | MINOR | NaN depths | **applied** | §4.1 `SetDepth`/`Add` guard, WP-3 test |
| 31 | MINOR | `Find-Unity` default path only | **applied** | §9.1 (`UNITY_EXE` → Hub install location → default, 6000.3 check), §1.5 YAMLMerge path, WP-0 Hub install location on D: |
| 32 | MINOR | reference shots/goldens imported from `Assets/` | **applied** | §1.2: `Golden/` and `Docs/Reference/` outside `Assets`; only the dev fixtures stay under `Assets/_Snowbloom/DevFixtures/` (they are TextAssets in dev builds) |

### 14.2 `crit_fidelity.md` (2 BLOCKER, 7 MAJOR, 7 MINOR)

| # | Sev. | Item | Result | Where / why |
|---|---|---|---|---|
| 1 | BLOCKER | the plan does not fit 2–3 weeks | **applied** | A21, §8.2, K20, README_ko.md: option A (M1a / M1b split) is the default plan, option B (cut list) offered; re-baselined to M1a ≈ 30 days single-session / ≈ 22–24 days with Track C in parallel (≈ 4.5–5 weeks), M1b ≈ +8 days (≈ 1.5–2 weeks). The critic's calendar line ("5–6 weeks single-track") is replaced by these numbers, which follow from its own day counts plus the fixes adopted here |
| 2 | BLOCKER | old saves need Tier C art; §5 wrongly said Phaser shows placeholders | **applied: (a) for buildings and people, (b) for ground art** | §5.3 Tier A+ / B+ and the corrected sentence; WP-10 (static exteriors, workers' looks, `v43a3_late` fixture with a no-placeholder test); 05 §16.3 and 03 §5.10 contradiction resolved. Rejected part: baking the rail strip's and town's ground from Phaser screenshots in WP-R — a screenshot carries the snow base, shading and the preset's resolution, cannot sit under Unity's own props and goes stale with every data change; rails/street art stay plain snow, agreed with the designer before WP-10 (J11, §11) |
| 3 | MAJOR | customers from 3 looks instead of ≈ 25 | **applied** | A23, §5.3 Tier A+ (all villager looks, ASTC 6×6 for the extra looks, ≈ 22 MiB), WP-2 test, WP-8 rule, J8 |
| 4 | MAJOR | resident cast differs between specs | **applied** | A23, WP-6 (4 people + dog, `JobPet` in the slice), J7, 05 §16.1 and 00 fixed; K15 note kept |
| 5 | MAJOR | nothing machine-checkable against Phaser | **applied, modified** | A22, WP-R (day 1–2, display list + loop trace + resident trace), T tests in WP-4/6/8. Modifications: 저사양 off but the living-water objects excluded from comparisons; constant-0.5 randomness with a cycling fallback for any rejection loop that would hang |
| 6 | MAJOR | side-by-side comparison not reproducible | **applied** | §10.2 protocol (look pass in Chrome with the URL flags and 저사양 in a fresh profile; feel pass on the usual preset; WebView fallback steps; daytime for loaded villages), WP-11 「Phaser 저사양처럼」 toggle; 06 L6 annotated |
| 7 | MAJOR | the phone shows a system font, not Pretendard | **applied** | A10, §4.6, 05 §11: default Noto Sans KR Bold/Black (+ Roboto digits if the screenshot shows them), decided from a screenshot in WP-0 before WP-8; Pretendard as a design choice |
| 8 | MAJOR | ground tap has no target/feedback rules | **applied** | §6.1 ground-tap mode (pad snap, FreeSpot, `g_noWay`, quiet walk, ring, re-tap, tutorial bypass of `available`), WP-6 tests, J6 |
| 9 | MINOR | superseded sections unmarked; contradictions | **applied** | SUPERSEDED banners in 02 §10, 03 §9 (P2/P3), 04 C5 and §15; 04/05/06 contradictions fixed in place |
| 10 | MINOR | 04 flip rule text wrong | **applied** | 04 C4 and §4.3 corrected (flip inside the frame box; `flipShift` for every character) |
| 11 | MINOR | stall sign in no WP | **applied** | §4.4 row, WP-4 `SignText` |
| 12 | MINOR | HUD differences unlisted | **applied** | §4.7 (population chip shown; inactive whistle/goal look-alikes), J9 note |
| 13 | MINOR | after the fisher stub | **applied** | WP-8 `SliceEnd`, J8, 06 note |
| 14 | MINOR | particles order; Culler tie order | **applied** | §4.1 |
| 15 | MINOR | APK delivery to a phone not on the PC | **applied** | §9.1 `publish`, WP-0 hello-world install, K24 |
| 16 | MINOR | Track C oracles are spec readings | **applied** | A22, WP-8 ("done only when the trace replay is green"), WP-6 T test, K25 |
