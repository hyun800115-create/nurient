# fx_city build report (CONTRACT_V8 §AC) — polish pass

The city FX and UI kit is in `assets/fx_city/`: all 17 contract FX sheets plus 6 extras (`fx_fire_glow`,
`fx_hose_rope`, `fx_hose_rope_long`, `fx_hose_tip`, `fx_fight_cloud_back`, `fx_fight_cloud_front`), all 24 contract
icons plus a bank stamp, and the 4 contract panels plus 9 helper pieces (newspaper masthead / column / photo /
divider / logo / logo_en, passbook row, news card, wanted silhouette). `check_fx_city.py` reports **0 errors,
0 warnings**; payload **2440 KB** (limit 3 MB); the Phaser 3.90 test passes (all frames, 8-direction aimed jets
without hooks, phone-zoom street, no page errors, no 404s).

This pass fixed every high and medium issue of the critic review and the cheap lows (table at the end). The
biggest changes: a **measured per-building fire mounting table** (87 buildings) instead of a topPx rule, building
fires with an **iso, irregular base** and a soft rim matching the house fire FX, a real **window fire**, a
**two-person snow-powder scuffle** (plus back / front layers for the cityfolk `fight` anim), **water-looking,
symmetric hose jets** with new aiming rules, readable **sirens**, **seam-free smoke** that breaks up at the top, a
taller newspaper headline bar + masthead with an optional **Jua logotype**, distinct **move-in / move-out** icons,
an **unknown-culprit portrait**, and **lazy load groups** for texture memory.

Build: procedural (numpy + Pillow on `fxlib`), no Blender, deterministic. No existing script or asset was edited,
no state-changing git command was run. **One code change is still needed before the game can load the kit:** add
`'fx_city'` to `FRAGMENTS` in `src/core/Assets.js` (v4 code agents own it). The manifest uses the standard §2
format, so `Assets.sheetAnims` creates the anims as-is (anim key = sheet key).

## FX spritesheets

All NORMAL blend (saturated cores, coloured rims - readable on white snow and at night). Frames run left to right,
wrapped into rows of at most 2048 px. Loops are seamless; one-shots are visible on frame 0 and fade at the end.
`lazy` / `group` mark sheets that only need to be resident during an incident (see Texture memory).

| key | frame | frames | fps | play | anchor | group | what / how the game uses it |
|---|---|---|---|---|---|---|---|
| fx_fire_bld_s | 240x272 | 12 | 14 | loop | [0.5, 0.7757] | fire | Building fire, base span 196 px, flames 136 px. Toy flame tongues rising out of an iso 2:1 ellipse on the roof plane: big tongues root on its back half, lower ones on its front half; the fire melts into the roof along a curved noisy edge (no straight band). Thin light rim like `fx/fx_fire`, inner glow, licks, solid embers. Anchor = centre of the iso base. |
| fx_fire_bld_m | 328x360 | 12 | 14 | loop | [0.5, 0.7792] | fire | Same, span 270 px, flames 176 px. |
| fx_fire_bld_l | 424x432 | 12 | 14 | loop | [0.5, 0.7697] | fire | Same, span 350 px, flames 216 px. |
| fx_fire_glow | 192x96 | 12 | 10 | loop | [0.5, 0.5] | fire | Extra: flickering firelight on a plane (2:1). Under each building fire, on the snow in front (x1.5-2.5), on a smouldering ruin. |
| fx_fire_window | 96x144 | 12 | 14 | loop | [0.5, 0.74] | fire | A glowing iso window opening (burning room, sooty lintel, soot streak) with flames curling out of its top edge, licks, sparks, wall glow. Drawn for a LEFT-facing wall; `setFlipX(true)` for a right-facing wall. |
| fx_smoke_column | 224x400 | 16 | 10 | loop | [0.32, 0.95] | fire | Tall plume, smoothed billows (no bubble-wrap seams, rim only on the outer silhouette), each puff fades by its own age so the top breaks into ragged puffs that drift off; underside lit orange. flipX for the other wind. |
| fx_embers | 128x224 | 16 | 12 | loop | [0.5, 0.96] | fire | Solid 6-8 px warm cores with a dark-orange rim and short trails, spiralling up. |
| fx_hose_stream | 32x24 | 8 | 30 | loop | [0, 0.5] | fire | Water-jet segment, seamless in x, flows +4 px/frame: cyan-white core, translucent edges, light rim; vertically symmetric (any aim angle). Canvas-fallback chain. |
| fx_hose_rope | 256x24 | 8 | 30 | loop | [0, 0.5] | fire | Extra: Rope texture (8 bead periods) for arcs up to 360 px - the recommended path. |
| fx_hose_rope_long | 512x24 | 8 | 30 | loop | [0, 0.5] | fire | Extra: 16 bead periods for arcs over 360 px (beads keep their size). |
| fx_hose_tip | 96x80 | 8 | 30 | loop | [0, 0.5] | fire | Extra: starts at exactly the jet width, necks into blobs and fans into filled teardrop droplets falling with gravity (no flat cap, nothing clipped). `setFlipY(T.x < N.x)`. |
| fx_water_mist | 160x112 | 12 | 14 | loop | [0.5, 0.6] | fire | Spray cloud, splash flicks (now fade out before the loop wraps), droplets, glints at the impact point. |
| fx_steam_puff | 128x192 | 14 | 16 | once | [0.5, 0.9] | fire | White steam billow where water meets fire (unchanged). |
| fx_fight_cloud | 192x176 | 12 | 14 | loop | [0.5, 0.86] | fight | Simple scuffle: a tumbling ball of SNOW POWDER with two distinct faces in all 12 frames (A: round eyes + big brows; B: squinty eyes under a yellow beanie), fists and boots in two consistent outfits (A red parka + jeans, B blue parka + brown trousers), A's red bobble hat knocked off, dizzy stars, pow bursts, swooshes, kicked-up snow. |
| fx_fight_cloud_back | 224x192 | 12 | 14 | loop | [0.5, 0.86] | fight | Extra (layered scuffle): shadow, kicked-up snow, far half of a snow-powder ring. Behind the two residents. |
| fx_fight_cloud_front | 224x192 | 12 | 14 | loop | [0.5, 0.86] | fight | Extra: near half of the ring with gaps (fighters show through), swooshes, pow bursts, dizzy stars. In front, same frame as _back. |
| fx_alarm_flash | 128x128 | 8 | 10 | loop | [0.5, 0.5] | core | Red alarm lamp with "!", warning burst (~2.5 Hz, under the 3 Hz photosensitivity limit), ringing arcs (unchanged). |
| fx_siren_glow_red | 128x64 | 8 | 12 | loop | [0.5, 0.5] | core | Saturated light fan on the ground plane, pulsing ring with a #D3202A edge, four-point flare 16 -> 48 px when facing the camera. At the vehicle `sirenPoint`. |
| fx_siren_glow_blue | 128x64 | 8 | 12 | loop | [0.5, 0.5] | core | Same in blue (#1E5BD8 rim), half a turn later. Police: start both on the same frame. |
| fx_demolish_dust | 256x192 | 16 | 20 | once | [0.5, 0.78] | demolish | Collapse / demolition (unchanged). |
| fx_question_mark | 80x112 | 12 | 10 | loop | [0.5, 0.95] | core | Curious resident "?" (unchanged). |
| fx_lightbulb_idea | 96x128 | 14 | 16 | once | [0.5, 0.95] | core | "Aha!" bulb, ends lit: hold ~0.8 s, then fade (unchanged). |
| fx_memory_sparkle | 112x112 | 16 | 12 | loop | [0.5, 0.9] | core | Remembering / rumour: pastel twinkles and ribbon spiral (unchanged). |

### `fireMount` — how the game places a building fire
- **`fireMount.buildings[spriteKey]`** (87 buildings: town 23, beach_bld 21, props 14, harbor 11, buildings 9,
  vehicles 6, logistics 3; civic is picked up automatically once it exists - `gen_fx_city.py --mount-only`): `fires: [[dx, dy, sheetKey, scale,
  depthOffset], ...]` back to front, `glow: [dx, dy, scale]`, `smoke: [dx, dy, scale]`, `embers: [dx, dy]`,
  `windows: [[dx, dy, flipX, scale], ...]`, `alarm: [dx, dy]`; px from the building anchor at scale 1.
  `tools/fx/gen_fx_city_mount.py` MEASURES each render: roof line = median of the silhouette's top edge over the
  central 84 % of the footprint (towers, chimneys and floating shop signs no longer lift the fire), base 0.22 x
  footprint below it; window points = the lit window panes of the render (highest pane per wall, flipX on the right
  wall), heuristic wall points (checked to lie on the wall) when no panes are found, none for open stations.
  Preview: `docs/previews/fxcity_firemount.png` (every building burning exactly per its entry).
- **Sizes:** S for footprint <= 240 px, M <= 330, L above; scale clamp(0.85 x fw / span, 0.85, 1.15); low open
  stations (topPx < 200) x max(0.6, topPx / 200). **Wide buildings** (> 400 px) get n = ceil(fw / 400) fires along
  the roof's long axis (14 buildings: school, train station, ferry terminal, fish auction, harbour warehouse, bus
  depot, stable / fuel depot, resort hotels, logistics centre x3 ...).
- **Fallback rule** (`pick` / `place`) for buildings that appear later; `check_fx_city.py` warns when a current
  building has no entry (re-run the builder).
- **Tint:** while it burns, `setTint` flickering between 0xffe2c8 and 0xffcfa6 every 0.12-0.18 s (lit by its own
  fire); fade toward 0xd9cfc8 (soot) while dying, then swap to the civic `ruin_*` sprite.
- **Stages** (`grow`): window fire + small smoke -> full fire (table fires, glow, windows, smoke, embers) -> dying
  (more steam, lighter smoke) -> ruin with glow + small smoke + faint embers. `alarm`: fx_alarm_flash at the alarm
  post or `buildings[k].alarm` until the truck arrives.

### `hoseAim` — aimable water jet
- **Arc:** dx = T.x - N.x, dy = T.y - N.y, L = |T - N|; h = clamp(0.3·|dx|, 8, 120), then h = min(h, max(8,
  (1.2·|dx| - dy) / 4)) - the jet never overshoots and hooks back down onto a target above it; side bow b =
  0.06·L·max(0, 1 - |dx| / (0.5·|dy| + 1)) + 0.025·L·sin(1.7·t) (near-vertical aims curve softly, the hose sways);
  P(s) = N + (T - N)s + [0, -4hs(1-s)] + nrm·4bs(1-s), nrm = unit normal of T - N with x >= 0.
- **Rope (WebGL, recommended):** `fx_hose_rope` for arcs <= 360 px, `fx_hose_rope_long` above; points every ~12 px;
  `setFrame((f + 1) % 8)` at 30 fps; re-run `setPoints` when aiming / swaying.
- **Flip:** jet textures are vertically symmetric (no flip at any angle); `fx_hose_tip.setFlipY(T.x < N.x)`.
- **Depth:** rope / chain = max(firefighter.depth, building.depth + 1) + 0.5; tip, mist, steam at rope depth + 1.
- **Chain (Canvas fallback):** ceil(len / 32) `fx_hose_stream` sprites rotated to the tangent, scaleX (L + 1) / 32,
  scaleY 1 -> 0.7, tip at the end.

### `fightGuide`
- **`play` (preferred, CONTRACT_V8 §AD):** stand the two residents ~44 px apart facing each other and play their
  cityfolk `fight` anims; at the ground midpoint play `fx_fight_cloud_back` (depth min - 0.5) and
  `fx_fight_cloud_front` (depth max + 0.5) on the same frame for 2-4 s; then `fx_poof`, part them dizzy / sulking,
  police arrives with red + blue glows.
- **`playSimple`** (far zoom / LOD / before cityfolk ships): hide both and play `fx_fight_cloud`.
- **`curious`:** `?` when asking about something new, the bulb when learning, the sparkle when remembering.

### Texture memory (GPU, RGBA8)
| group | sheets | MB |
|---|---|---|
| core (always) | alarm, sirens, ?, bulb, memory (2.8) + ui4_icons atlas (1.1) | 3.9 |
| ui (always / with the panels) | 13 panel images | 1.1 |
| fire (lazy) | all fire / smoke / embers / hose / mist / steam sheets | 28.4 |
| fight (lazy) | fight_cloud + back + front | 5.5 |
| demolish (lazy) | demolish_dust | 3.0 |

Load a group on demand and `textures.remove()` it after the last incident - better, load only the sheets the
burning building's entry names: a typical S fire (fire_s, glow, window, smoke, embers, hose, mist, steam) is ~15 MB;
fire_l (8.4 MB) is only needed for the 4 buildings that use it. Total if everything were resident: 41.9 MB (35.6
before, all of it always loaded); the always-resident part is now 5.0 MB.

## UI
**`ui4_icons`** (trimmed JSON-hash atlas 1016x264, sourceSize 96x96, anchor [0.5, 0.5]): piggy, loan, interest,
passbook, insurance, story, rumor, question, friend_new, memory, **move_in** (house with the door open and warm light
inside, heart welcome mat, green arrow curving in, a box), **move_out** (orange moving truck with boxes driving off,
speed lines - a different silhouette, not just a different arrow colour), newspaper, badge, wanted, cuffs_cute,
thief, fire_alert, firetruck, hydrant, box, forklift, settle, stock + `ui_stamp_bank`.

**Panels** (plain images for `this.add.nineslice`; no text baked except the optional logotypes):

| key | size | 9-slice L/R/T/B | layout |
|---|---|---|---|
| ui_wanted_poster | 224x296 | fixed | titleBox [40,22,144,36], portraitWindow [48,78,128,128], nameBox [40,224,144,26], rewardIcon [52,262,24,24], rewardBox [82,256,104,26]; x0.3 on the wanted board |
| ui_wanted_silhouette | 128x128 | fixed | NEW: unknown-culprit portrait (navy shadow bust, beanie, yellow "?") for portraitWindow - the "도둑을 찾아라" mission |
| ui_newspaper | 160x160 | 26/26/26/30 | page, contentInset [24,24,24,28] |
| ui_newspaper_masthead | 320x104 | 96/96/18/26 | pinecone medallions; titleBox [96,12,128,64] now 64 px tall (was 52) |
| ui_newspaper_logo | 266x65 | fixed | NEW optional logotype "솔방울 신문" (Jua, OFL): newsprint ink, snow caps on 솔방울, dangling pinecone; centre in the masthead titleBox |
| ui_newspaper_logo_en | 317x52 | fixed | NEW "Pinecone News" (Fredoka, OFL) |
| ui_newspaper_column | 112x140 | 16/16/54/16 | headline bar 36 px (was 22) - headlineBox [10,9,-10,36] fits 24-30 px headlines; contentInset [12,56,12,10] |
| ui_newspaper_photo | 96x80 | 14/14/14/14 | photo slot, contentInset [10,10,10,10] |
| ui_newspaper_divider | 128x16 | 24/24/6/6 | section rule |
| ui_passbook | 200x200 | 48/32/74/30 | titleBox [44,12,120,22], headerY 66, rows in contentInset [42,74,22,26] |
| ui_passbook_row | 128x32 | 10/10/4/6 | one 32 px line; stamp incoming rows with ui_stamp_bank x0.3 |
| ui_story_card / _news | 176x124 | 40/26/36/36 | rumour / news cards, iconPoint [24,20], contentInset [18,34,16,28] |

## Previews (`docs/previews/`)
- `fxcity_sheet.png` (all 23 strips over snow / plaza / sea / night), `fxcity_ui.png` (icons at 96 / 48 / 32,
  panels with margins, mock-ups: wanted posters known + unknown culprit with head-and-shoulders portraits, the
  솔방울 신문 page with the logotype and 36 px headline bars, passbook with a 이월 row and stamps on incoming rows
  only, story cards). Korean preview text uses Pretendard + Jua (OFL; Pretendard fetched once into the build cache).
- `fxcity_firemount.png`: all 87 buildings burning per `fireMount.buildings`.
- `fxcity_phone_z06.png`, `fxcity_phone_z12.png`: Phaser at 390x844 CSS px, DPR 3, camera zoom 0.6 / 1.2 x 1.65:
  townhouse + 2-fire school burning (tint flicker, glow, window fires, smoke, embers), two swaying Rope hoses with
  mist + steam, fire truck + siren, police car + red / blue sirens, layered scuffle with two villagers inside, the
  simple cloud, crowd with ? / bulb / sparkle, alarm.
- `fxcity_<key>.gif` for 22 sheets, `fxcity_hose_arc.gif` (jets aimed right / left / steep / long, rope + chain,
  flipped tips, sway), `fxcity_fight_layers.gif` (layered vs simple scuffle).
- `fxcity_scene.png`: 1x street mock-up (town houses, fire truck, police car, townfolk crowd, wanted board, newspaper
  + rumour card UI) with the fire placed from the table.
- `fxcity_phaser.png`: the load-test screenshot.

## Checks
- `python3 tools/fx/check_fx_city.py`: **0 errors, 0 warnings** (87 buildings in the mount table; GPU core 3.9 +
  ui 1.1 MB always resident, fire 28.4 / fight 5.5 / demolish 3.0 MB lazy; payload 2440.5 KB). New checks: hose textures vertically symmetric; fireMount.buildings
  entries valid and cross-checked against the current building manifests; lazy sheets have a group; GPU memory per
  group reported (core + ui must stay <= 8 MB).
- `node tools/test/fx_city_phaser.mjs`: **exit 0** - 23 anims, 268 frames checked, 0 missing, 55 sprites playing,
  8 Rope jets (E ... NE) + 2 chains (18 segments) measured: no hook-back, N / S aims bow 12 px (no rigid pole),
  fx_hose_tip flipped exactly for the leftward aims; 8 nine-slices; 41 textures; phone shots at zoom 0.6 and 1.2;
  no page errors, no 404s.
- Determinism: re-rendering fx_fight_cloud, fx_siren_glow_red and fx_hose_tip gives byte-identical PNGs.

## Known issues
- `assets/civic` and `assets/cityfolk` don't exist yet: the scene / phone shots use stand-ins (drawn board,
  streetlight as alarm post, townfolk / villagers as firefighters, police and fighters - `angry` villagers instead of
  the cityfolk `fight` anim). `gen_fx_city_scene.py` and the mount table pick up civic / beach_bld buildings
  automatically; re-run `python3 tools/fx/gen_fx_city.py` when they land (the check warns until then).
- Window points come from lit window panes in the renders; 19 buildings without detectable panes are flagged
  `windowsGuess` (heuristic wall points, kept only where the silhouette really has a wall) and 13 (open stations,
  stalls, the hotel pool, the watchtower ...) get no window fire. Exact `fxPoints.windows` / `blaze` points from the
  building owners would be better (no messaging between agents in this run).
- `fireMount.buildings` is a snapshot of the building fragments at build time; after town / civic / beach_bld /
  logistics change, run `python3 tools/fx/gen_fx_city.py --mount-only` (the check warns when entries are missing).
- Every footprinted 'building' / 'station' gets an entry, including odd ones (hotel pool, piers, tents); the game
  decides what may burn.
- The Canvas-fallback chain still shows small steps at bends (straight 32 px pieces); the Rope is smooth.
- Fires are a fixed 12-frame loop; a very long fire repeats visibly after ~1 s at close zoom (as before).
- The scene and GIFs draw the Rope with a Python stand-in; the phone shots are the real Phaser Rope.

## Critic review -> outcome (polish pass)

| # | sev | issue | outcome |
|---|---|---|---|
| 1 | high | fireMount numbers: fires float above towered roofs / slice facades, scale clamped on 39/48 buildings, no multi-fire rule | **fixed**: per-building measured table (87 buildings, roof line from the median top edge), new S/M/L spans 196/270/350, clamp 0.85-1.15, n = ceil(fw/400) fires along the roof axis in table + rule, own keys (no `fxPoints.fire` reuse) |
| 2 | high | straight glowing band at the fire base, pasted look | **fixed**: iso 2:1 base, tongue roots at different heights, curved noisy fade, iso roof glow + `fx_fire_glow`, building tint flicker rule |
| 3 | high | fight cloud reads as one mascot, random limbs, beige dust, guide hides the cityfolk `fight` anim | **fixed**: two distinct faces in 12/12 frames, two consistent outfits, bigger fists / boots, flying hat, snow powder; `fx_fight_cloud_back` / `_front` + `fightGuide.play` (layered) / `playSimple` |
| 4 | med | steep aims hook back / rigid poles | **fixed**: h from abs(dx) + no-hook cap, side bow + sway; 8-direction test measures hook / bow |
| 5 | med | leftward aims lit from below, droplets fly up | **fixed**: vertically symmetric jet textures (checked), `fx_hose_tip.setFlipY(T.x < N.x)` (tested) |
| 6 | med | jet reads as a blue pipe; tip step, flat cap, bubble droplets | **fixed**: cyan-white core, translucent edges, light rim; tip starts at jet width, necks + fans into filled teardrops |
| 7 | med | contradictory hose depth rule | **fixed**: max(firefighter, building + 1) + 0.5; tip / mist / steam + 1 |
| 8 | med | window fire has no window, no window points | **fixed**: iso opening + soot + flames from the top edge, flipX facing; measured window points per building |
| 9 | med | sirens invisible on snow | **fixed**: 16-48 px four-point flare, saturated rims #D3202A / #1E5BD8, pulsing ring. `_add` night variant **won't fix** (NORMAL art already reads at night) |
| 10 | med | smoke bubble-wrap seams, flat ceiling | **fixed**: smoothed height field, outer rim only, per-puff age fade, puffs break away |
| 11 | med | heavy dark fire outline vs house FX | **fixed**: 1.4 px light rim #C8401A @ 0.8 (was 2.2-2.9 px #9E2412) |
| 12 | med | 35.6 MB GPU, not lazy | **fixed**: `lazy` + `group` per sheet, conventions + per-sheet loading advice; always resident 5.0 MB. fire_l kept (contract key; only 4 buildings load it) |
| 13 | med | headline bar 22 px, masthead title 52 px | **fixed**: 36 px bar (top margin 54), masthead title area 64 px (strip 104 px) |
| 14 | low | masthead in system font | **fixed**: optional `ui_newspaper_logo` (Jua) + `_en` (Fredoka); strip stays text-free |
| 15 | low | censor-bar portrait, tiny face, no unknown-culprit art | **fixed**: head-and-shoulders crop (head ~70 %), no band; `ui_wanted_silhouette` |
| 16 | low | move_in / move_out differ only by arrow hue | **fixed**: open lit doorway + heart mat vs moving truck |
| 17 | low | tip clipped; chain stepped; one rope length | tip **fixed** (96x80); `fx_hose_rope_long` + `ropeLongFromPx` **fixed**; chain steps **won't fix** (Canvas fallback only - feathering a seamless texture would bead at every joint; Rope is smooth) |
| 18 | low | hollow 4-6 px embers; mist arc pops at the wrap | **fixed**: solid 6-8 px cores + dark-orange rim; splash arcs fade out before the wrap |
| 19 | low | passbook stamps / 이월 row; Hangul preview font | **fixed**: stamps on incoming rows only, 이월 1,000 row; previews in Pretendard + Jua |

## Files (`/home/user/nurient/frost-village/`)
- `tools/fx/gen_fx_city.py` (builder, specs, manifest guides; `python3 tools/fx/gen_fx_city.py`, ~10 min with 2
  workers; `--no-gif`, `--no-scene`, `--only k1,k2` for scratch, `--mount-only` to re-measure buildings)
- `tools/fx/gen_fx_city_fx.py` (FX art), `tools/fx/gen_ui4.py` (icons + panels), `tools/fx/gen_fx_city_mount.py`
  (NEW: per-building fire mount table + firemount preview), `tools/fx/gen_fx_city_preview.py`,
  `tools/fx/gen_fx_city_scene.py`, `tools/fx/check_fx_city.py`, `tools/test/fx_city_phaser.mjs`
- `assets/fx_city/` (23 sheets, ui4_icons.png/.json, 13 panel images, manifest.json)
