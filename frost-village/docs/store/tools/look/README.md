# Store look — how the panoramas and the 8 screenshots were staged

The raw pictures behind `docs/store/assets` (2026-10-27, "healing" look) were taken from the real game at the published
commit `aa169bd` (v4.2), with the save fixture `tools/test/fixtures/v41_save_smart_46min.json` (a 46-minute village with
the neighbour town open). Nothing is painted in; scenes are only staged with the game's own test hooks (`window.__FV`)
on the fixed-step clock. `store_shots.mjs` (one level up) is the older one-shot script for the previous 1080 x 2160 set;
the current set was staged by hand with the tools here, so each picture could be looked at and re-framed.

## Tools

| file | what |
|---|---|
| `driver.mjs` | a long-lived game page with a tiny HTTP API: `POST /eval?arg=<json>` (body = a JS function source, run in the page with the parsed arg), `POST /shot?path=<png>`, `GET /log`, `POST /quit`. Args: `<repo>/frost-village <port> <save fixture> <vw>x<vh> <dpr> [lang]`. Sound off, `water: 'high'`, and `loop.actualFps` pinned to 60 so a slow software renderer does not drop to half resolution. |
| `ev.sh <port> <jsfile or -> [arg-json]` | send one function to the driver |
| `js/setup_wide.js {w,h}` / `js/setup_portrait.js {}` | put the game loop to sleep and install `__run(sec)` (logic only), `__draw()`, `__day(hour)`; the wide one also hides the UI scene and sets the canvas size |
| `js/fixk.js {k}` | render scale; `k: 1.5` makes the 360 x 640 CSS page draw 1080 x 1920 |
| `js/view.js` | landscape panorama stager (camera x/y/zoom, hour, run seconds, hide labels / pads / texture keys / props above y, ground pool size, occlusion fade off, rig limits, chief position) |
| `js/pview.js` | portrait stager: the same plus `hud: { obj, hide: [regex], keys: [texture substrings], offscreen }` to hide guide panels, order chips, off-screen arrows; `noDog` (hides the old dog), `keepBanner` / `noFade` (ceremony banner), `coins`, `follow: [dx, dy]` (camera on the chief) |
| `js/ceremony.js {t, cx, cy}` | gather residents with a `party` life event at the hall, then replay the rank-up ceremony to `t` seconds |
| `js/restaurant.js` | lunch rush: stock the restaurant, 2 table sets, second server, run until ≥ 10 seated / ≥ 4 eating |
| `js/pilot_seek.js {n, step, minStack, x0..y1}` | run 관망 mode until the chief carries ≥ `minStack` inside a box |
| `js/life.js [names]` | start village life events (`chat`, `snowball`, `tag`, `party`, …) |

All heavy commands ran with `nice -n 10`, one browser at a time, `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`.

## Recipes

```sh
git worktree add --detach /tmp/look_wt aa169bd
R=/tmp/look_wt/frost-village; T=frost-village/docs/store/tools/look
HK='["ui_icons:","ui2_icons:","v42_core:nav_","v42_core:ui_","fx_coin_spin","bld_sites:site_plot"]'
HUD='{"obj":["objPanel"],"hide":["정기 납품","→"],"keys":["ui_icons:ui_arrow","v42_core:nav_edge"],"offscreen":true}'

# feature graphic panoramas: 1600 x 800 CSS at DPR 2 = 3200 x 1600
nice -n 10 node $T/driver.mjs $R 8711 v41_save_smart_46min.json 1600x800 2 &
$T/ev.sh 8711 $T/js/setup_wide.js '{"w":3200,"h":1600}'
C='"run":2,"settle":true,"hide":true,"hideAbove":0,"hideKeys":'$HK',"pool":600,"noOcc":true,"rigs":160,"chief":[1500,900]'
$T/ev.sh 8711 $T/js/view.js "{\"x\":2520,\"y\":960,\"z\":0.62,\"hour\":17.3,$C}"   && curl -X POST "localhost:8711/shot?path=$PWD/A_coast_golden.png"
$T/ev.sh 8711 $T/js/view.js "{\"x\":2520,\"y\":960,\"z\":0.62,\"hour\":19.15,$C}"  && curl -X POST "localhost:8711/shot?path=$PWD/B_coast_dusk.png"
$T/ev.sh 8711 $T/js/view.js "{\"x\":700,\"y\":420,\"z\":0.8889,\"hour\":17.3,$C}"  && curl -X POST "localhost:8711/shot?path=$PWD/C_village_golden.png"
curl -X POST localhost:8711/quit

# phone screenshots: 360 x 640 CSS at DPR 3, render scale 1.5 = 1080 x 1920
nice -n 10 node $T/driver.mjs $R 8712 v41_save_smart_46min.json 360x640 3 &
$T/ev.sh 8712 $T/js/setup_portrait.js '{}' && $T/ev.sh 8712 $T/js/fixk.js '{"k":1.5}'
P='"settle":true,"hideWorld":true,"hideKeys":'$HK',"hideAbove":0,"noOcc":true,"hud":'$HUD',"noDog":true'
shot() { curl -X POST "localhost:8712/shot?path=$PWD/$1.png"; }
# 01 village, morning (start a few life events first)
$T/ev.sh 8712 $T/js/life.js '["chat","snowball","tag","snowman","chat","wave"]'
$T/ev.sh 8712 $T/js/pview.js "{\"x\":1060,\"y\":960,\"z\":0.6,\"hour\":9.5,\"run\":4,\"rigs\":80,\"pool\":200,\"chief\":[1180,1020],$P}" && shot 01_village
# 02 neighbour town square / playground
$T/ev.sh 8712 $T/js/pview.js "{\"x\":4760,\"y\":2200,\"z\":0.85,\"hour\":15.7,\"run\":3,\"rigs\":80,\"pool\":200,$P}" && shot 02_town
# 03 train arriving at 서리역
echo '() => { const nb = window.__FV.scene.v4; window.__day(10.3); window.__FV.clearStack(); window.__FV.teleport(nb.ours.x + 160, nb.ours.y + 260); nb.rail.set("atOurs", 1); window.__run(1.5); nb.rail.set("toOurs", nb.rail.leg.T - 1.2); window.__run(3.2); return nb.rail.state(); }' | $T/ev.sh 8712 -
$T/ev.sh 8712 $T/js/pview.js "{\"x\":3330,\"y\":1400,\"z\":0.85,\"run\":0,$P}" && shot 03_train
# 04 restaurant lunch
$T/ev.sh 8712 $T/js/restaurant.js
$T/ev.sh 8712 $T/js/pview.js "{\"x\":-660,\"y\":740,\"z\":1.05,\"run\":1,\"chief\":[-420,1250],$P}" && shot 04_restaurant
# 05 harbour at golden hour, the boat coming home
echo '() => { window.__day(17.6); window.__run(2); return true; }' | $T/ev.sh 8712 -
$T/ev.sh 8712 $T/js/pview.js "{\"x\":2420,\"y\":560,\"z\":0.78,\"hour\":17.7,\"run\":0.5,\"chief\":[300,1500],$P}" && shot 05_harbour
# 06 관망 mode (pilot on, wait until the chief carries a stack near the east docks, follow him)
echo '() => { const F = window.__FV; F.camera(); window.__day(10.5); F.v42.pilot(true); window.__run(14); return true; }' | $T/ev.sh 8712 -
$T/ev.sh 8712 $T/js/pilot_seek.js '{"n":120,"step":0.5,"minStack":5,"x0":2450,"x1":3000,"y0":900,"y1":1500}'
$T/ev.sh 8712 $T/js/pview.js "{\"z\":0.72,\"run\":0,\"follow\":[60,-40],$P}" && shot 06_watch
echo '() => { window.__FV.v42.pilot(false); window.__run(1); return true; }' | $T/ev.sh 8712 -
# 07 rank-up ceremony crowd (서리마을 → 서리읍)
$T/ev.sh 8712 $T/js/ceremony.js '{"t":1.5,"cx":-40,"cy":200}'
$T/ev.sh 8712 $T/js/pview.js "{\"x\":-880,\"y\":1990,\"z\":1.05,\"run\":0,\"keepBanner\":true,\"noFade\":true,$P}" && shot 07_ceremony
# 08 west village and hall at dusk, lights on
$T/ev.sh 8712 $T/js/pview.js "{\"x\":-700,\"y\":1450,\"z\":0.66,\"hour\":19.7,\"run\":2,\"chief\":[1500,1900],$P}" && shot 08_evening
curl -X POST localhost:8712/quit
```

Life events and the boat are timing-dependent, so a re-run gives a similar, not identical, picture: look at each one
and nudge `x` / `y` / `z` / `run`. The coin counter in the HUD is whatever the save has at that moment (it differs a
little between shots).

Then: icons with `../icon_scenes.py` (Blender), and framing / captions / checks / bundle with `../make_graphics.py`.

## After the Maltipoo 누리 update

Re-take the shots on the commit that ships 누리, drop `"noDog":true`, and add one shot where 누리 is clearly visible
(e.g. next to the chief in the village square), so the store matches the game.
