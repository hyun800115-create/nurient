# title_code — the living title screen ("행복한 눈꽃마을 이야기")

I've built the new title as standalone modules in `src/title/`. They don't touch any existing src file:
the lead wires them in with about 10 lines (§2). The centrepiece is a **TitleDiorama**, a snowy island
in the sea made from the game's real sprites. It grows through **개척 → 마을 → 읍 → 도시** while the camera
pulls back and morning turns into dusk and then night. Windows and streetlights come on, the lighthouse
beam sweeps, the aurora rises, and finally the title_art 3D logo drops in letter by letter and
"터치하여 시작" appears. After the first run the title shows **the player's own stage** (read-only save
adapter) with its everyday life, and grows it once when the save has moved on.

Verified with `node tools/test/title_lab.mjs`: the real Boot + Preload + Assets.js in headless Chromium on
a fixed-step clock. All 18 checks pass (§7).

## 1. Files

| Path | What |
|---|---|
| `src/title/config.js` | **The one place for the name** (`TITLE_NAME`), title texts ko/en, timings (`TITLE_CFG.intro`), intro mode, idle time of day, cue sounds, screen layout (`TITLE_LAYOUT`) |
| `src/title/layout.js` | The diorama: island shape, objects per stage (`s` appears / `u` replaced), roads per stage (road-kit cells), rail, piers, actors, vehicles, train, ships, gulls, camera per stage |
| `src/title/TitleScene.js` | Drop-in replacement for `src/scenes/Title.js`. It uses the same key `'Title'` and keeps every old behaviour: the first tap is the audio-unlock gesture, then sfx_click + bgm_title + sfx_whoosh, a fade and `scene.start('Game')`. It also restarts on resize and sets `window.__FV.title` |
| `src/title/TitleScreen.js` | `mountTitle(scene, hooks)`: three cameras (sky / world / ui), intro timeline, idle title, skip, start, cues, snow, art hot-swap, `replayIntro()`, `state()` |
| `src/title/TitleDiorama.js` | The island: ground layers, objects + bouncy pops + snow puffs, night glows, lamps, fires, lighthouse beam, smoke, people, 콩이, vehicles, train, ships, gulls |
| `src/title/TitleSky.js` | Sky gradients, stars, moon, aurora, clouds, mountains, forest, far city lights, and a world-locked sea with parallax |
| `src/title/TitleLogo.js` | title_art logo: a per-letter drop (meta.logo.main.parts), then a swap to the one-piece logo, a shine sweep through the shine mask (BitmapMask) and twinkles. Without the art it falls back to a canvas text logo built from `TITLE_NAME` |
| `src/title/TitleUI.js` | The start pill, PC hint, version label, settings gear, skip hint, stage chips 개척›마을›읍›도시 and the "마을이 자랐어요!" ribbon |
| `src/title/TitleSettings.js` | A small settings card for the gear: sound, music, language, opening once / always / never, "오프닝 다시 보기" |
| `src/title/TitleAssets.js` | Loading (bake groups, title art, late cue sounds), readiness, Phaser anims from baked frames, `release()` |
| `src/title/TitleFx.js` | Procedural stand-ins, made only when needed (sky, stars, aurora, mountains, moon, haze, lighthouse beam, shine) |
| `src/title/prefs.js` | The title's own localStorage (`frostVillage.title.v1`: introSeen, last stage shown, intro mode), reduced-motion and low-memory detection |
| `src/title/progress.js` | **Save-progress adapter (read-only)**: `readProgress()` → `{ exists, stage }` and `stageFromSave(raw)` |
| `src/title/bake/` | Baked pictures: `ttl_<stage>_0.webp/.json` atlases, `ttl_ground_*.webp`, `title_bake.json` |
| `tools/title/bake_title.mjs` + `bake_page.js` + `title_pack.py` | The bake (Playwright + the game's real loader → trimmed pieces → MaxRects webp atlases per stage + window-glow pieces). `--preview 1,2,3,4` renders layout composites |
| `tools/title/apply_name.mjs` | Copies `TITLE_NAME` into index.html, manifest.webmanifest and strings.js. Dry run by default, `--write` applies |
| `tools/test/title_lab.mjs` | The lab: video, stills, checks, perf, memory, payload |
| `tools/test/title/title_perf.mjs` | The old title and the new one in the same browser: logic time, draw calls, texture binds, GPU time ratio |
| `docs/previews/title_*` | `title_intro.mp4/.gif`, `title_stage_1..4.png`, `title_idle_city_night.png`, `title_grow.png`, `title_idle_village.png`, `title_reduced.png`, `*_360x640.png` |
| `docs/기획서_타이틀.md` | Korean note for the designer |

## 2. Wiring it in (the lead's changes)

**main.js** (the scene list stays `[Boot, Preload, Title, Game, UI]`):
```diff
-import { Title } from './scenes/Title.js';
+import { TitleScene as Title } from './title/TitleScene.js';
```

**Preload.js**: the title's first stage (≈205 KB) and the title art (logo, sky) ride along with the
game's own boot files, so the title's first frame never waits for them:
```diff
 import { View } from '../core/View.js';
+import { TitleAssets } from '../title/TitleAssets.js';
+import { getLang } from '../data/strings.js';
 ...
   preload() {
     this.load.on('loaderror', (f) => Assets.onLoadError(f, this.load));
     Assets.queueManifests(this.load);
+    TitleAssets.queueEarly(this.load);            // title_bake.json + assets/title/manifest.json
   }
 ...
     Assets.queueAssets(this.load, { musicFilter: (k) => !Assets.isDeferredAudio(k) && !Assets.isUnusedAudio(k) });
+    TitleAssets.queueGroup(this.load, 1);         // island ground + camp (stage 1)
+    TitleAssets.queueArt(this.load, { lang: getLang(), k: View.k });   // logo + backdrop + fx (title_art)
```
Without these lines `TitleScene.preload()` loads the same files itself. That first paint waits for
≈205 KB plus the art; nothing else changes.

**Boot.js**: no change. The title only needs what Boot already does: `Settings.load`, `setLang` and
`Audio.init`.

**Title.js**: no longer used. Keep it as a fallback, or delete it. If you'd rather keep your own scene,
mount the title inside it instead:
```js
import { mountTitle } from '../title/TitleScreen.js';
import { TitleAssets } from '../title/TitleAssets.js';
import { VERSION } from '../data/version.js';
create() {
  this.screen = mountTitle(this, { version: VERSION, onStart: () => this.scene.start('Game') });
  this.events.once('shutdown', () => { this.screen.destroy(); TitleAssets.release(this.sys.game); });
}
update(time, delta) { this.screen.update(delta / 1000); }
```

**Old title art at boot (optional, saves 478 KB)**: `ui_title_bg` (358 KB) and `portrait_player_512`
(120 KB) were only used by the old Title.js, but Preload still loads them. To stop loading them, add them
to `Assets.isUnused`, for example `const TITLE_ONLY = /^(ui_title_bg|portrait_player_512)$/;` → `isUnused(key) { return ... || TITLE_ONLY.test(key); }`.
(manifest.webmanifest still points at the 512 portrait as the home-screen icon. That is a plain file
link and is not affected. title_art also made real icons in `assets/title/icon/`.)

**Shipping the bake (artifact / GitHub Pages)**: in dev the bake is served from `src/title/bake/`, but
`tools/build/build_artifact.mjs` only copies `assets/` fragment folders. To ship it:
```sh
node tools/title/bake_title.mjs --out assets/title_bake    # also writes a stub manifest.json for the packager
```
then set `bakeBase: 'assets/title_bake/'` in `src/title/config.js` and add `'title', 'title_bake'` to
`LATE_FRAGMENTS` in `src/core/Assets.js`. That list is only read by the build, so they get packaged
(including `--inline` packs) but are never boot-loaded by Assets.js. The packer refuses to write into a
folder that holds another fragment's manifest.

**Settings button**: the gear (top right) opens the title's own card (§1). To open the game's panel
instead, set `window.__FV_TITLE_HOOKS = { onSettings }` before the title starts. `{ settings: false }`
hides the gear.

**Name**: edit `TITLE_NAME` in `src/title/config.js`, then run `node tools/title/apply_name.mjs --write`.
That updates index.html (`<title>`, meta description, loading text), manifest.webmanifest (name,
short_name) and strings.js (ko / en `title` + `subtitle`). Re-render the 3D logo from
`tools/blender/ttl_config.py` (title_art). The dry run currently shows the three files still saying
서리마을 개척기 / Frost Village.

## 3. Bake or runtime? Both, split by what the game already loads

- **Runtime from the game's atlases only** would need town (2.1 MB), harbor (1.4 MB), vehicles, ships,
  buildings, roads and pets2 atlases at full resolution before the city can appear. That is several MB
  and well over 100 MB of GPU memory, so the title would wait for big atlases.
- **Flat per-stage webp layers** can't pop buildings one by one, light windows separately, tint by time
  of day or animate anything.
- **What I chose:**
  - An offline bake of every late-fragment picture as a trimmed piece, at the scale it is seen on the
    title (0.62–1.0 of game resolution). The pieces are MaxRects-packed into one webp atlas page per
    growth stage. The bake also writes the island ground (base + one overlay per stage, laid with the
    road-kit rules) and a half-resolution warm "window glow" piece per building, extracted from its lit
    panes, for the night.
  - Pictures the game already loads before the title (core props, the chief, villagers, fx) are drawn
    live from the game's own atlases, at 0 extra bytes. The bake only stores their night glow.
  - Small live overlays: fire (`fx_fire`), lamp and window glows (warm NORMAL-blended pictures that batch
    with the buildings), additive fire glows and lighthouse beam (procedural wedge), chimney smoke (one
    pooled emitter), snow (title_art layers) and pops (`fx_poof` + title_art `ttl_fx_pop`).
- **First paint**: stage 1 (≈205 KB) is ready at once. Stages 2–4 stream in while the intro plays. A late
  stage holds the intro clock for at most `maxWaitSec` (2.5 s); after that its pictures fade in when they
  land.

## 4. Save-progress adapter (read-only)

`src/title/progress.js` reads the raw `frostVillage.save.v1` with `readJSON`. It never migrates, writes
or backs up (the lab checks that the stored save string is unchanged). Mapping:

| Stage | When |
|---|---|
| 1 개척 | no save, or the first steps |
| 2 마을 | `progress.celebrated`, `done.zone_forest`, territory east/south, any finished site, or ≥ 10 done steps |
| 3 읍 | `v4.town.open`, `territory.town`, a finished `station` site, or `progress.celebrated3` |
| 4 도시 | `save.city`, `save.v5` or `v4.city.open`: **v5 must set one of these** (until then the city only appears in the intro) |

To pass the game's own value instead, use `window.__FV_TITLE_HOOKS = { stage: n }` or
`scene.start('Title', { title: { stage: n } })`. Title memory (`frostVillage.title.v1`, separate from the
save) remembers `shown` so the "마을이 자랐어요!" growth plays once per new stage.

## 5. Audio cues

`TITLE_CFG.cues` maps each event to the first loaded key:

| Event | Sound |
|---|---|
| pop | `sfx_build_done` (deferred to the Game, so in practice) → `sfx_build` |
| hero / stage | `sfx_unlock` |
| train | `sfx_steam_whistle` |
| bus | `sfx_bus_horn` |
| ferry | `sfx_ship_horn_big` |
| logo | `sfx_levelup` |
| skip | `sfx_whoosh` |

The audio3 / audio4 cue sounds (≈80 KB with their manifests) are fetched by the title after its pictures,
under their real keys, and stay in the audio cache for the game. Assets.js state is not touched.
Browsers stay silent until the first tap, so the first-run intro is silent. The skip tap starts
`bgm_title` and the remaining cues. The start tap is the old one: `sfx_click`, `bgm_title`, `sfx_whoosh`,
fade, Game.

## 6. Intro settings and accessibility

- `TITLE_CFG.introMode`: `'first'` (default: play once), `'always'` or `'never'`. The player's choice in
  the settings card (`TitlePrefs.setIntroMode`) wins over it, and the URL wins over both (`?intro=1`,
  `?intro=0`). `screen.replayIntro()` plays it again.
- `prefers-reduced-motion` (or `?motion=0`): no intro, no camera motion, no pops, snow or moving life.
  People hold their first pose and the logo fades in.
- `navigator.deviceMemory <= 2`: stages above `TITLE_CFG.lowMemStageCap` (3) are not loaded.
- A tap during the intro skips to the end (city at night, logo, start pill). The next tap starts the game.

## 7. Measured (title_lab, SwiftShader, 390×844 @2x → canvas 792×1714)

| What | New title | Old title (src/scenes/Title.js) |
|---|---|---|
| Logic per frame (`update`, 120 steps, stage 4 at night, everything moving) | **0.11 ms avg, 0.2 ms p95** (273 objects) | 0.03 ms (17 objects) |
| Draw calls per frame | **19** (72 texture binds) | 1 |
| GPU time per frame (SwiftShader on a busy shared 4-core box; only the ratio means anything) | 883 ms | 317 ms → **≈ 2.8×** |
| JS heap after 20 s of title updates (GC'd, precise memory info) | **−81 KB** (no per-frame garbage) | – |
| Title texture memory, all 4 stages + title art resident | **55.5 MB** (bake 35.3 MB, title art ≈ 20 MB) → **0 MB after the game starts** | – |
| Extra download of the title (beyond the game's own boot files) | **1,412 KB**: bake 1,332 KB (stage 1 205 / 2 175 / 3 463 / 4 468 KB + manifest) + late cue sounds 80 KB | – |
| title_art files this phone fetched (its own budget, see title_art.md) | 1,096 KB (main logo _1x, parts, shine, sky, strips, fx) | (ui_title_bg 358 KB + portrait 120 KB, see §2) |

- The numbers come from `tools/test/title/title_perf.mjs` (old and new title in the same browser and on the
  same canvas, measured interleaved) and `tools/test/title_lab.mjs`.
- Logic is far inside a 60 fps budget, and the per-frame code allocates nothing: records and pools are made
  up front and pops run on their own clock.
- Rendering is fill-bound: several full-width backdrop layers plus the island. To keep the draw calls low,
  the window, lamp and headlight glows use NORMAL blending and batch with their buildings (90 → 19 calls).
  Only the few big lights (fires, lighthouse) are additive.
- main.js's weak-GPU fallback (drop to k = 1 below 30 fps) only watches the Game scene. Suggest
  `game.scene.isActive('Game') || game.scene.isActive('Title')` in its check.
- Results of the last run: **all title checks pass**:
  - loads every stage
  - the intro ends in the idle city with logo + pill
  - 360×640 works
  - a returning player (stage 2 save, title last showed 1) grows the village on the title with the ribbon,
    prefs remember it, and the save is untouched
  - reduced motion
  - texture memory ≤ 60 MB, and every title texture is released when the game starts
  - no page errors
  - payload ≤ 1.5 MB, GIF ≤ 8 MB (6.95 MB; the MP4 is 14 s, 720×1558, 30 fps)

## 8. Lab

```sh
node tools/test/title_lab.mjs            # everything: video, stills, checks, perf (~10-15 min on a busy box)
node tools/test/title_lab.mjs --quick    # stills + checks only
node tools/title/bake_title.mjs --preview 1,2,3,4 --previewDir /tmp/p   # layout composites while editing layout.js
```

The lab boots the real Boot + Preload (Assets.js) with `TitleScene` and a stub Game scene. It waits for
every stage, then replays the intro on the fixed-step clock (60 steps per game second, seeded
`Math.random`). It reads each 30 fps frame straight from the canvas. Then it checks the 360×640 layout,
a returning player (save at stage 2, title last showed 1 → growth + ribbon, prefs updated, save
untouched) and reduced motion. It also measures perf, heap growth, texture memory before and after the
game starts, and payload.

## 8b. What the code reads from title_art (assets/title)

The title code reads these keys at runtime, so title_art can re-render any of them without a code change.
A missing key falls back to a procedural stand-in.
- Sky and backdrop: `ttl_sky_day` / `_dusk` / `_night` (stretched), `ttl_stars`, `ttl_moon`, `ttl_aurora`
  (ADD), and the tiling strips `ttl_clouds`, `ttl_mtn_far`, `ttl_city_far`, `ttl_city_lights` (ADD),
  `ttl_mtn_mid` and `ttl_forest` (the forest at 0.42× as a far tree line). Strips are tinted from
  `meta.tints`.
- Logo: `ttl_logo_main` (or `ttl_logo_main_1x` when k < 1.5, `ttl_logo_en*` in English), with width from
  `meta.layout.logoMain.widthLogical`. Then `ttl_logo_main_shine` (mask) + `ttl_shine_band`,
  `ttl_logo_parts` with `meta.logo.main.parts`, and the `ttl_fx` frames `ttl_fx_twinkle`, `ttl_fx_snow_s`,
  `ttl_fx_snow_m`, `ttl_fx_flake_s` and `ttl_fx_snow_bokeh`.
- Pop: the `ttl_fx_pop` spritesheet.
- Not loaded: `_short` logos and icons, plus the other language's and the other scale's logo.

## 9. Known issues and follow-ups

- **No sound in the very first intro.** Browsers keep audio locked until the first tap. The skip tap starts
  the music and the remaining cues. This is by design.
- **The city (stage 4) only appears in the intro until v5 marks it in the save** (`city` / `v5` /
  `v4.city.open`, §4).
- **Shipping**: `src/title/bake` is served in dev and on Pages, but the artifact build only copies `assets/`.
  Bake to `assets/title_bake` and list it, as in §2.
- **Fill rate is ≈ 2.8× the old title** in SwiftShader (§7). On weak phones the k = 1 fallback should cover
  the title too. `navigator.deviceMemory <= 2` phones never load stage 4 (`lowMemStageCap`).
- **Not in the diorama yet**: the beach hotel, the logistics centre and civic buildings. Their fragments
  were still being made when I baked. Add them to `OBJECTS` in `layout.js` and re-run
  `node tools/title/bake_title.mjs`. Any change to `layout.js` or to the game art it uses needs a re-bake.
  The title_art pictures are read at runtime, so they need nothing.
- The old title's line-up of the chief and crew on the snow is gone. The chief (carrying his fish tower),
  콩이, villagers and workers now live in the diorama.
- The canvas text-logo fallback uses the system font. It only shows if `assets/title` is missing.
- Rotation / resize restarts the title, as the old one did. The textures reload from the browser cache and
  the intro does not replay.
- `window.__FV_TITLE_HOOKS` is a small global hook (`onSettings`, `stage`, `settings: false`).
  `scene.start('Title', { title: {...} })` works too.
