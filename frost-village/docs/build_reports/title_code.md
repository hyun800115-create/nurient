# title_code — the living title screen ("행복한 눈꽃마을 이야기")

The new title lives in standalone modules in `src/title/`. No existing src file was changed. The lead wires
it in with a few lines (§2).

The title is built around a TitleDiorama: a snowy island in the sea, made from the game's real sprites. It
grows through 개척 → 마을 → 읍 → 도시 while the camera pulls back and morning turns to dusk and then night.
Windows and streetlights come on, the snow train pulls into its station with a whistle, the ferry glides up to
the lighthouse with its horn, and the aurora rises. Then the title_art 3D logo drops in letter by letter and
"터치하여 시작" appears. After the first run the title shows the player's own stage: the camp and the village
at a warm dusk, the town and the city at night. It reads the save without changing it, and plays the growth
once when the save has moved on.

This version is the polish pass after the critic's review. Every high and medium issue reproduced and is
fixed (§10 lists each one). `node tools/test/title_lab.mjs` runs the real Boot + Preload + Assets.js in
headless Chromium on a fixed-step clock. It passes all 37 checks, including new adversarial ones: a
texture leak, a low-memory phone, a late stage on a slow network, the first-visit sound, and the save → stage
mapping.

## 1. Files (all under `/home/user/nurient/frost-village/`)

| Path | What |
|---|---|
| `src/title/config.js` | The one place for the name (`TITLE_NAME`). Also ko/en texts (`TITLE_TEXT`), intro timings (`TITLE_CFG.intro`), intro mode, idle time of day (`idleTime: 'auto'`), sound cues and screen layout (`TITLE_LAYOUT`) |
| `src/title/layout.js` | The diorama: island shape, which objects appear (`s`) or are replaced (`u`) at each stage, roads, rail, piers, people, vehicles, train (`introRun` / `introSec`), ships (ferry lane + `scale`), gulls. Camera per stage for the intro (`CAMERA`) and the idle title (`IDLE_CAMERA`) |
| `src/title/plan.js` | **New.** What this title shows (intro or idle, stage, low-memory cap, time of day), decided once from the save and prefs. It also lists what the first frame needs and what streams in later |
| `src/title/TitleScene.js` | Drop-in replacement for `src/scenes/Title.js`, same key `'Title'`. Its preload waits only for this player's first frame. It frees all title textures when the game starts |
| `src/title/TitleScreen.js` | `mountTitle(scene, hooks)`: three cameras (sky / world / ui), the intro director with its own clock, the idle title, sound on / skip / start, cues, snow, late-art upgrades, `replayIntro()`, `state()` |
| `src/title/TitleDiorama.js` | The island: ground layers, buildings popping in with snow puffs (replaced ones leave only once their successors are loaded), night window glows, lamps, fires, lighthouse beam, smoke, people, 콩이, vehicles, train, ships, gulls |
| `src/title/TitleSky.js` | Sky, stars, moon, aurora, clouds, mountains, forest, far city. Art that lands late replaces its stand-in in place, or fades in over it |
| `src/title/TitleLogo.js` | Per-letter drop of the title_art logo (intro), one-piece drop (idle), shine sweep, twinkles, cross-fade. Falls back to a canvas text logo built from `TITLE_NAME` |
| `src/title/TitleUI.js` | Start pill, PC hint, version label, settings gear (tappable only once shown), intro hint + **skip pill**, stage chips (as many as this phone shows), "마을이 자랐어요!" ribbon |
| `src/title/TitleSettings.js` | Small settings card for the gear: sound, music, language, opening once / always / never, "오프닝 다시 보기" |
| `src/title/TitleAssets.js` | Loading in packs (first paint now, the rest streamed two at a time), readiness, `release()`: frees textures, aborts downloads, removes late arrivals |
| `src/title/audioUnlock.js` | **New.** `armAudioUnlock()`: any tap or key from the loading screen on turns the game's sound on |
| `src/title/TitleFx.js` | Procedural stand-ins, made only when the title art is missing |
| `src/title/prefs.js` | The title's own localStorage key `frostVillage.title.v1` (never the save), reduced-motion and low-memory detection |
| `src/title/progress.js` | Read-only save adapter: `readProgress()` → `{ exists, stage, rank }`, `stageFromSave(raw)`, `rankOf(raw)` |
| `src/title/bake/` | Baked pictures: `ttl_<stage>_0.webp/.json` atlases, `ttl_ground_*.webp`, `title_bake.json`. Unchanged in this pass: the source art is older than the bake and `OBJECTS` did not change |
| `tools/title/bake_title.mjs`, `bake_page.js`, `title_pack.py` | The bake: the game's real loader in Playwright → trimmed pieces → one webp atlas per stage, plus window-glow pieces. `--preview` renders layout composites |
| `tools/title/apply_name.mjs` | Copies `TITLE_NAME` into index.html, manifest.webmanifest and strings.js. Dry run by default, `--write` applies |
| `tools/test/title_lab.mjs` | The lab: video, stills, checks, performance, memory, payload. `--quick`, `--only <sections>`, `--prev <dir>` |
| `tools/test/title/title_net.mjs` | **New.** The title on emulated 4G / 3G, with and without the Preload wiring |
| `tools/test/title/title_perf.mjs` | Old title vs new title in the same browser |
| `docs/previews/title_*` | `title_intro.mp4` / `.gif`, `title_stage_1..4.png`, `title_idle_city_night.png`, `title_grow.png`, `title_idle_village.png`, `title_reduced.png`, `*_360x640.png` |
| `docs/기획서_타이틀.md` | Korean note for the designer |

TitleScene keeps all of the old title's behaviour:
- A tap starts the game with sfx_click, bgm_title and sfx_whoosh, a fade, then the Game scene.
- A resize restarts the title (without replaying the intro).
- `window.__FV.title` still points at the scene.

## 2. Wiring it in (the lead's changes)

**main.js** (the scene list stays `[Boot, Preload, Title, Game, UI]`):
```diff
-import { Title } from './scenes/Title.js';
+import { TitleScene as Title } from './title/TitleScene.js';
```

**Preload.js — required for a good first frame.** These lines fetch the title's first frame together with
the game's own boot files, and turn the sound on when the player taps the loading screen:
```diff
 import { View } from '../core/View.js';
+import { TitleAssets } from '../title/TitleAssets.js';
+import { armAudioUnlock } from '../title/audioUnlock.js';
+import { TITLE_TEXT } from '../title/config.js';
+import { getLang } from '../data/strings.js';
 ...
   preload() {
     this.load.on('loaderror', (f) => Assets.onLoadError(f, this.load));
     Assets.queueManifests(this.load);
+    TitleAssets.queueManifests(this.load);       // title_bake.json + assets/title/manifest.json (~41 KB)
   }

   create() {
+    armAudioUnlock();                            // any tap from here on turns the sound on for the opening
     ...
     const label = this.add.text(...t('loading')...);
+    const tx = TITLE_TEXT[getLang()] || TITLE_TEXT.ko;     // "탭하면 소리가 켜져요" under the bar
+    this.add.text(W / 2, H * 0.66, tx.sound, { resolution: 2, fontFamily: FONT, fontSize: '22px', fontStyle: '700', color: '#7d8aa0' }).setOrigin(0.5, 0);
     Assets.mergeManifests(this.cache.json);
     Assets.queueAssets(this.load, { musicFilter: ... });
+    TitleAssets.queueFirstPaint(this.load);      // only what this player's title shows first (table below)
```

What `queueFirstPaint` fetches depends on the player (`src/title/plan.js`, sizes for a ko phone with the @2x logo):

| Player | First paint | KB |
|---|---|---|
| First visit (the intro) | stage-1 bake, sky + mountains + forest + clouds, snow fx, one-piece logo | ≈ 947 |
| Returning, camp | the same + logo shine | ≈ 1016 |
| Returning, city | stages 1–4 of the bake, the backdrop, night sky, far city, logo + shine | ≈ 2420 |

Everything else streams while the title plays (§3).

If these lines are missing, `TitleScene.preload()` fetches the same first-paint packs itself. The title still
never shows stand-in art first or swaps it with a hard cut, but:
- there are 1.7 s (first visit) to 4.1 s (a returning city player) of blank screen on 4G between the loading bar
  and the title (5.7 s on 3G);
- the sound stays off until the first tap on the title;
- on 3G the intro waits 2.0 s for the city instead of 0 s (§7).

**Boot.js** — no change needed.

**Title.js** — no longer used; keep it as a fallback or delete it. To keep your own scene instead, mount the
title inside it:
```js
import { mountTitle } from '../title/TitleScreen.js';
import { TitleAssets } from '../title/TitleAssets.js';
import { armAudioUnlock } from '../title/audioUnlock.js';
import { VERSION } from '../data/version.js';
preload() { armAudioUnlock(); TitleAssets.queueFirstPaint(this.load); }
create() {
  this.screen = mountTitle(this, { version: VERSION, onStart: () => this.scene.start('Game') });
  this.events.once('shutdown', () => { this.screen.destroy(); TitleAssets.release(this.sys.game); });
}
update(t, d) { this.screen.update(d / 1000); }
```

**Optional, saves 478 KB at boot:** `ui_title_bg` (358 KB) and `portrait_player_512` (120 KB) were only used by
the old title. Add them to `Assets.isUnused`, e.g. `/^(ui_title_bg|portrait_player_512)$/`. That more than
pays for the intro's first paint.

**Shipping the bake (claude.ai artifact build):** `build_artifact.mjs` only copies `assets/` folders, so the bake
in `src/title/bake/` is not shipped as it stands.
1. Run `node tools/title/bake_title.mjs --out assets/title_bake` (it also writes a stub manifest.json).
2. Set `bakeBase: 'assets/title_bake/'` in `src/title/config.js`.
3. Add `'title', 'title_bake', 'audio4'` to `LATE_FRAGMENTS` in `src/core/Assets.js`. `audio4` holds the
   ferry's horn (`sfx_ship_horn_big`) and is not in that list yet. `audio3` (whistle, bus horn) already is.
   Only the build reads that list, so all three get packaged but are never loaded at boot.

**Settings gear:** it opens the title's own card. To open the game's settings panel instead, set
`window.__FV_TITLE_HOOKS = { onSettings }`; `{ settings: false }` hides the gear.

**Weak GPUs:** main.js's k = 1 fallback only watches the Game scene. Use
`game.scene.isActive('Game') || game.scene.isActive('Title')` in its check.

**Name:** edit `TITLE_NAME`, then run `node tools/title/apply_name.mjs --write`. The dry run shows index.html,
manifest.webmanifest and strings.js still say 서리마을 개척기 / Frost Village. The 3D logo is re-rendered from
`tools/blender/ttl_config.py`.

## 3. Bake or runtime, and what is fetched when

Pictures the game already loads before the title (core props, the chief, villagers, fx) are drawn live from
the game's own atlases (0 extra bytes); the bake only adds their night glow. Everything from the late fragments
(town, harbour, vehicles, ships…) is baked, trimmed, at the scale the title shows it (0.62–1.0), into one webp
atlas per growth stage. The bake also holds the island ground (a base plus one overlay per stage) and a
half-resolution window-glow piece per building.
- **Runtime only** would need the full late atlases (several MB, over 100 MB GPU) before the city could appear.
- **Flat per-stage layers** couldn't pop buildings one by one, light windows separately, follow the time of
  day or animate.

The title fetches in **packs** (`TitleAssets`, `plan.js`): `g1`–`g4` (the bake of each stage), `art:sky`,
`art:night` (stars, moon, aurora), `art:fx` (snow), `art:logo`, `art:shine`, `art:parts` (letter pieces),
`art:pop`, `art:city` (far city strips), `cues` (late sounds).
- **First paint**: only what the first frame shows (table in §2). The title scene's preload waits for it;
  with the Preload wiring it is already there.
- **Intro stream**: `g2`, `g3`, `art:pop`, `g4`, `art:night`, `cues`, `art:city`, `art:parts`, `art:shine`.
  Two packs download at a time, the island first, so stage 2 is never queued behind the city or the stars. The
  pop sparkle and the painted night sky have stand-ins (the game's own puff, procedural stars) until they land.
- **Idle stream**: `art:night`, plus `art:pop` if the village grows, plus `cues` for a town or city. The idle
  title never fetches a stage, logo pieces or a far city it does not show.
- **Low-memory phones** (`navigator.deviceMemory <= 2`) never fetch `g4` or `art:city`; their intro ends at 읍.

## 4. Save adapter (read-only)

`progress.js` reads the raw `frostVillage.save.v1` and never migrates, writes or backs it up. The lab checks
that the stored save string is unchanged. The game's own rank decides the town and the city
(v4 plan §9/§12: `v4.rank` 1 마을 | 2 읍 | 3 도시; strings `rank_1..3`):

| Stage | When |
|---|---|
| 1 개척 | No save, or only the first steps |
| 2 마을 | `celebrated` or `celebrated3`, `zone_forest` done, territory east / south / rail / town open, `v4.town.open`, any finished site, or 10+ done steps. This covers v3 complete, the station repaired and the town open, all still rank 1 |
| 3 읍 | `v4.rank >= 2` or `progress.flags.rankEup` (the 승격식 was held) |
| 4 도시 | `v4.rank >= 3` (or `v4.city.open`) |

`Save.js` `sanitizeV4` clamps `rank` to 1|2 today. **v5 must let it reach 3**; then the city shows on the
title with no title change. A top-level `save.city` / `save.v5` is no longer part of the contract
(`sanitizeSave` would drop it anyway).

You can override the stage with `__FV_TITLE_HOOKS = { stage }` or `scene.start('Title', { title: { stage } })`.

## 5. Sound

**First visit:** browsers keep sound off until the page is touched.
- **Tap on the loading screen** (with `armAudioUnlock()` in Preload, and in TitleScene.preload anyway): the sound
  is on before the title. `bgm_title` starts on the title's first frame and the intro plays with all its cues.
- **No tap before the intro:** the first tap turns the sound on and starts `bgm_title`. The intro goes on and
  the hint changes "탭하면 소리가 켜져요" → "한 번 더 탭하면 건너뛰어요". The **skip pill** (bottom right) or a
  second tap skips; the next tap starts the game.

Cue timeline of the intro (lab, Audio recorded). The big cues are at least 0.6 s apart:

| Time | Event | Sound |
|---|---|---|
| 0.4 – 9.5 s | Buildings pop / each stage's hero building | `sfx_build_done` → `sfx_build` until the game has it / `sfx_unlock` |
| 5.9 s | The train pulls in (stage 3 + 0.9 s; it docks by ~7.3 s) | `sfx_steam_whistle` |
| 8.6 s | Bus (stage 4 + 1.1 s) | `sfx_bus_horn` |
| 9.4 s | The ferry glides towards the lighthouse (stage 4 + 1.9 s) | `sfx_ship_horn_big` |
| 10.1 s | The logo lands | `sfx_levelup` |
| (skip) | Skip | `sfx_whoosh` |

- On the idle title the train whistles on each arrival and the ferry sounds its horn when it docks (never twice
  for the same arrival).
- The title fetches the audio3/audio4 cue sounds itself (about 80 KB) under their real keys. They stay cached
  for the game, and the game's asset registry is untouched.

## 6. Intro settings, slow networks and accessibility

- `introMode` in config: `'first'` (default), `'always'` or `'never'`. The player's choice in the settings card
  wins over it, and `?intro=1` / `?intro=0` in the address wins over both. `replayIntro()` plays it again.
- **Slow network:** when a stage's pack is late, the intro's *director* waits at that stage start for at most
  `maxWaitSec` (2.5 s): camera, time of day and growth pause. People, 콩이, vehicles, ships, the sea, the aurora
  and the snow keep moving. Buildings that a stage replaces leave only when their successors' pictures are in,
  so the island never shrinks. Measured on emulated 3G (§7): wired, the intro waited 0 s in all; not wired, 2.0 s
  (this pass's first stream order: 6.0 s; the critic measured 3.2–4.8 s of frozen screen before this pass).
- **Reduced motion** (`prefers-reduced-motion` or `?motion=0`): no intro, no camera motion or pops, people hold
  one pose, the logo fades in.
- **Low-memory phones** (≤ 2 GB): the intro grows to 읍 and ends there, with three chips. Nothing of the city is
  fetched and the intro never waits for it.

## 7. Measured

The lab and the perf tool use SwiftShader at 390×844 @2x (k = 1.1, canvas 792×1714) on a busy shared 4-core box.

| What | New title | Old title |
|---|---|---|
| Logic per frame (`update`, stage 4 at night, everything moving) | **0.11 ms avg / 0.2 ms p95** (280 objects; 0.24 / 0.4 ms in a later run at load ≈ 27) | 0.03 ms |
| JS heap after 20 s of title updates (GC'd) | **-72 KB** (no per-frame garbage) | – |
| Title textures, returning camp player | **23.6 MB** | – |
| Title textures, all four stages + all art (intro end) | **58.4 MB** (≤ 60 MB) → **0 MB after the game starts**, also when files were still downloading | – |
| Extra download (bake + late cues), whole intro | **1,412 KB**: bake 1,332 KB (stage 1 205 / 2 175 / 3 463 / 4 468 KB + manifest 20) + late cue sounds 80 KB. title_art (its own budget): sky 563, night 159, logo 115, shine 68, parts 126, city 140, pop 60, fx 23 KB | – |
| Draw calls per frame (title_perf, previous pass) | 19 (72 texture binds) | 1 |

Network (`tools/test/title/title_net.mjs`, Chrome emulation: 4G 9 Mbit/s 60 ms, 3G 1.6 Mbit/s 150 ms; cache off; ko
browser; the game's own boot is ≈ 12.6 MB). "Wait" is the time between the game's loading bar finishing and the
title's first frame:

| Run | Wait (blank screen between bar and title) | Title files fetched (whole run) | Streamed packs ready (after the first frame) | Intro waits (at 60 fps) |
|---|---|---|---|---|
| First visit, 4G, **wired** | 0.0 s | 2544 KB | g2 +1.2 s, g3 +1.2 s, g4 +2.5 s, art:night +2.1 s, art:city +3.0 s, art:parts +3.0 s | 0.0 s |
| First visit, 4G, not wired | 1.7 s | 2544 KB | g2 +2.0 s, g3 +2.0 s, g4 +3.4 s, art:night +3.4 s, art:city +4.1 s, art:parts +4.1 s | 0.0 s |
| First visit, 3G, **wired** | 0.0 s | 2612 KB | g2 +2.3 s, g3 +4.8 s, g4 +7.4 s, art:night +7.4 s, art:city +9.2 s, art:parts +14.4 s | 0.0 s |
| First visit, 3G, not wired | 5.7 s | 2539 KB | g2 +2.3 s, g3 +5.1 s, g4 +9.5 s, art:night +9.5 s, art:city +12.2 s, art:parts +12.2 s | 2.0 s |
| Returning camp, 4G, wired | 0.0 s | 1177 KB | art:night +2.3 s | – |
| Returning city, 4G, wired | 0.0 s | 2424 KB | nothing (all in the first paint) | – |
| Returning city, 4G, not wired | 4.1 s | 2424 KB | nothing (all in the first paint) | – |

- 4G: the title's first frame comes 12.6 s after the loading bar appears when wired, 12.7 s when not
- 3G: the title's first frame comes 60.9 s after the loading bar appears when wired, 61.3 s when not
- Wired, the loading bar covers the title's first paint, so there is no blank screen; not wired, the same bytes arrive after the bar as a blank screen.
- Waits are modelled from the marks (a phone draws at 60 fps; SwiftShader here drew at about 1–8 fps, so the page's own clock is not used).
- With this pass's first stream order (pop sparkle and night sky before the town), the same 3G run waited 6.0 s (g2 1.0 + g3 2.5 + g4 2.5). The island-first order brought it to the numbers above.

## 8. Lab

```sh
node tools/test/title_lab.mjs                    # everything: video, stills, checks, perf (15-40 min in SwiftShader on a busy box)
node tools/test/title_lab.mjs --quick            # stills + checks only
node tools/test/title_lab.mjs --only leak,late   # sections: saves intro small returning reduced sound leak lowmem late payload
node tools/test/title/title_net.mjs wired 3g intro   # network timing (raw|wired, 4g|3g, intro|camp|city)
node tools/title/bake_title.mjs --preview 1,2,3,4 --previewDir /tmp/p   # layout composites while editing layout.js
```

The lab boots the real Boot + Preload (Assets.js) with `TitleScene` and a stub Game scene, and runs these checks:
- the save → stage table (§4)
- the idle camp fetches only what it shows, and holds ≤ 30 MB of textures
- the full intro on the fixed-step clock (video + stills), ending in the idle city with logo and pill, and the
  director never waits when everything is loaded
- ≤ 60 MB of textures, and 0 after the game starts
- 360×640
- a returning player whose village grows (ribbon, prefs updated, save string untouched, no stage 3–4 fetched)
- reduced motion
- the first tap turns sound on and the intro goes on; the second tap skips
- the cue timeline (whistle in the 읍 beat with the train docked by the end; big cues ≥ 0.6 s apart)
- **leak**: 16 title files held in the network while the player skips and starts the game, then released;
  both with the downloads aborted and with them landing late. 0 title textures either way
- **low memory**: the intro ends at 읍 with 3 chips, nothing of the city fetched, no waits
- **late stage**: `g4` held: the director waits ≤ 2.5 s while the chief keeps walking, the town keeps all 43 of
  its buildings, and the city arrives when the pictures do
- payload ≤ 1.5 MB, GIF ≤ 8 MB

Last full run: **all 37 checks pass**. The intro took 1335 s to render 420 frames on a box at load ≈ 25. GIF 7.27 MB (360 px, 15 fps); MP4 5.7 MB (720×1558, 30 fps, 14 s).

## 8b. What the code reads from title_art (assets/title)

The title code reads these keys at runtime, so title_art can re-render any of them without a code change. A
missing key falls back to a procedural stand-in. The pack a key belongs to is decided by `artRole(key)` in
`TitleAssets.js`, so new backdrop layers land in `art:sky` automatically.
- Sky and backdrop: `ttl_sky_day` / `_dusk` / `_night` (stretched), `ttl_stars`, `ttl_moon`, `ttl_aurora`
  (ADD), and the tiling strips `ttl_clouds`, `ttl_mtn_far`, `ttl_city_far`, `ttl_city_lights` (ADD),
  `ttl_mtn_mid` and `ttl_forest` (the forest at 0.42× as a far tree line). Strips are tinted from `meta.tints`.
- Logo: `ttl_logo_main` (`ttl_logo_en` in English). The `_1x` twin is used only when it would not be stretched
  (`k × widthLogical ≤ size2x / 2`), so a 390-px phone at k = 1.1 gets the sharp @2x logo. Then
  `ttl_logo_main_shine` (mask) + `ttl_shine_band`, `ttl_logo_parts` with `meta.logo.main.parts` (intro only),
  and the `ttl_fx` frames `ttl_fx_twinkle`, `ttl_fx_snow_s`, `ttl_fx_snow_m`, `ttl_fx_flake_s` and
  `ttl_fx_snow_bokeh`.
- Pop: the `ttl_fx_pop` spritesheet.
- Not loaded: `_short` logos and icons, plus the other language's logo.

## 9. Known issues and follow-ups

- **The city (stage 4) shows on the idle title only from rank 3**, which needs v5 to lift the rank clamp in
  `Save.js` (§4). Until then the city is in the intro.
- **Shipping**: bake to `assets/title_bake` and add `title`, `title_bake`, `audio4` to `LATE_FRAGMENTS` (§2).
- **Fill rate** is about 2.8× the old title in SwiftShader (previous pass). Weak phones need main.js's k = 1
  fallback to watch the Title scene too (§2).
- **A returning city player's first paint is the heaviest** (≈ 2420 KB): the whole bake is needed to show
  their city. They are long-time players, and the old title's 478 KB can be dropped (§2).
- **Not in the diorama yet**: the beach hotel, the logistics centre and civic buildings. Their fragments were
  still being made when I baked. Add them to `OBJECTS` in `layout.js` and re-run `node tools/title/bake_title.mjs`.
- The stage-2 dirt lane ends square in the snow at its west end (critic crop). It is visible only on a
  village-stage title and for 2.4 s of the intro; changing it needs a ground re-bake (§10).
- A file that never answers (a stalled request, no timeout) would keep the title's preload waiting, as it
  would the game's own Preload.
- The canvas text-logo fallback uses the system font. It only shows if `assets/title` is missing or late, and
  it cross-fades to the 3D logo when that lands.
- `window.__FV_TITLE_HOOKS` is a small global hook (`onSettings`, `stage`, `settings: false`).
  `scene.start('Title', { title: {...} })` works too.

## 10. Critic issues → what happened

Reproduced first with the critic's harness, copied to my scratch folder (`repro/adv.mjs`, `repro/stage_unit.mjs`) before any change. Now covered by lab checks.

| # | Sev. | Issue | Result | What changed / evidence |
|---|---|---|---|---|
| 1 | high | Texture leak: files still downloading when the game starts land in the Game scene (48.8 MB) | **fixed** | Reproduced at 48.8 MB / 24 textures. `TitleAssets.release()` now tracks every title file (`addfile` / `load` events) and aborts downloads still running. Keys still on their way are tombstoned and removed the moment they land (`addtexture`, json cache `add`). Re-queuing a key (resize restart) lifts its tombstone. Lab `leak (abort)` and `leak (land)`: 16 files held, 0 title textures after release |
| 2 | high | Idle title over-fetches every stage + all art (55 MB GPU, ~2.3 MB) | **fixed** | New `plan.js`. The first paint is only what this player's first frame shows; the stream is only what it will show. Idle camp: 19 files, no stage 2–4, logo parts, far city or pop, 23.6 MB textures (was 55.5 MB). Returning village player: no stage 3–4 (lab checks) |
| 3 | high | Late stage freezes everything for 2.5 s; low-memory intro plays a picture-less 도시 and the town shrinks; skip hard-codes stage 4 | **fixed** | (a) The intro loops to `cap`; skip and the intro end use `cap`; the chips show only `cap` stages. (b) The hold freezes only the director (stage schedule, camera, time of day, director timers); people, vehicles, ships, sky, sea, snow and UI keep their real dt. (c) Replaced buildings leave only when their successors' pack is ready, in `grow()` and in `setStageInstant()` (skip). (d) Instead of holding the Preload bar, the stream fetches the island first (g2, g3 before the night sky and pop). Lab `low memory`: cap 3, ends at 읍, 3 chips, nothing of the city fetched, 0 s waiting. Lab `late stage`: waits 2.5 s while the chief keeps walking, the town keeps 43/43 buildings, the city arrives when released |
| 4 | high | `stageFromSave` ignores `v4.rank` (v3-complete → 읍, rank 3 → 1) | **fixed** | `rankOf()`: rank ≥ 3 → 도시, rank ≥ 2 or `flags.rankEup` → 읍. v3 complete, station repaired and town open (all rank 1) → 마을. `save.city` / `save.v5` dropped from the contract; doc says v5 must lift `sanitizeV4`'s 1\|2 clamp. The critic's 11 cases now give 1/1/2/2/2/2/2/3/4/2/2 (was 1/1/3/2/2/3/3/3/1/2/2); lab `save -> stage` (10 cases) |
| 5 | high | First-run intro is always silent (the first tap both unlocks and skips) | **fixed** | `audioUnlock.js`: any tap / key from the loading screen on (Preload wiring, and TitleScene.preload anyway) turns sound on, and the title then plays `bgm_title` from its first frame. Otherwise the first intro tap = sound on + music, the intro goes on, and the hint changes to "한 번 더 탭하면 건너뛰어요". The new **skip pill** or a second tap skips. Lab `first visit` checks |
| 6 | medium | The 읍 train beat never happens; whistle at 9.78 s next to the bus and logo | **fixed** | `trainArrive(true)` creates the train if needed and runs it 8 m in 2.3 s (docked ~7.3 s). The director plays the whistle at stage 3 + 0.9 = 5.9 s. Bus 8.6 s, ferry horn 9.42 s, logo 10.1 s (gaps 2.7 / 0.82 / 0.68 s). Idle keeps the long arrival. Lab cue-timeline checks |
| 7 | medium | Without the Preload wiring: stand-in sky hard-cut, text logo never upgraded, `replayIntro` drops a pending swap; the wiring is not optional | **fixed** | `TitleScene.preload` fetches the same first-paint packs (backdrop, snow, logo), so the first frame never shows stand-ins. Art that still lands late is upgraded in place (sky, stars, moon, aurora) or faded in over the stand-ins (strips 0.7 s). The text logo cross-fades to the 3D logo. Snow swaps without a pop. Upgrades are pack events, not timers (director and real timers are separate). The doc now marks the Preload lines as required and lists what they fetch. Exercised by a synthetic upgrade run (stand-ins → 0.3 s cross-fade → art, no errors). Network numbers in §7 |
| 8 | medium | Stage 4: oversized ferry cut off at the left over the quay, left corner cut, empty sea band | **fixed** | Ferry lane `my −19`, stop `mx 13` (below the lighthouse, in the open water under the city), drawn at 0.85; in the intro it glides in from 4.5 m out. `CAMERA[4].span` 23.5 → 24.5, so both corners fit. `focusY` stays global (moving it shifts every stage). See `title_stage_4.png`, `title_idle_city_night.png` |
| 9 | medium | Idle is always full night: a dim blue camp with ~60 % empty snow | **fixed** | `idleTime: 'auto'`: dusk (1.12) for 개척 / 마을, night for 읍 / 도시. New `IDLE_CAMERA` for stages 1–2 puts the camp and the village mid-screen with the sea above them. See `title_grow.png`, `title_idle_village.png`, `title_reduced.png` |
| 10 | medium | Integration doc omits audio4 from the artifact build | **fixed** | §2: add `'title', 'title_bake', 'audio4'` to `LATE_FRAGMENTS` (audio4 holds the ferry horn) |
| 11 | low | 3D logo soft on 390-px phones (k ≈ 1.1 picked the `_1x` logo and stretched it) | **fixed** | `_1x` only when `k × widthLogical ≤ size2x/2` |
| 12 | low | The hidden gear (alpha 0) still took input during the intro, so a tap on its corner did nothing at all (critic's `gear` run) | **fixed** | The gear takes input only once the start pill is shown |
| 13 | low | Possible double ferry horn (intro beat + docking) | **fixed** | `cued` flag per arrival |
| 14 | — | Found in this pass: English players' first paint fetched the Korean logo (the language was not known before the title mounted) | **fixed** | The art filter defaults to the game's `getLang()` |
| 15 | — | Found in this pass: a second text logo recreated the shared canvas texture under a live logo (crash on the next frame) | **fixed** | One cached text-logo texture per language; `upgradeLogo` checks the 3D logo is really there first |
| 16 | — | Found in this pass: files added while the loader is running wait for the next scene update | **fixed** | `kick()` hands them to `checkLoadQueue()` at once |
| 17 | — | Found in this pass: `queueFirstPaint` in Preload.create started the boot loader itself, before Preload's own `load.start()` | **fixed** | An idle loader is left to its owner; only a finished one is restarted (`title_net.mjs` runs the wiring) |
| 18 | low | Stage-2 dirt lane ends square in the snow (critic crop) | **won't fix** | Needs a ground re-bake for a detail seen only on a village-stage title and for 2.4 s of the intro. Listed in §9 |

