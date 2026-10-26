# v4.2.1 B1-M art — 육고기 통조림 `item_can_meat`

Build report for the one new picture of the meat can (spec: `meatcan_spec.md` §6 A1, the designer's
"통조림은 생선말고 육고기 통조림도 만들어줘"). Art only: no `src/` file was touched; the cannery recipe, porters, pad and
shelf code are the code side of v4.2.1.

## Result

| | |
|---|---|
| Asset key | **`item_can_meat`** (sprite in `assets/buildings/manifest.json`, frame `item_can_meat` on the always-loaded page `bld_items`) |
| Look | a squat rounded luncheon-meat tin (0.40 × 0.22 × 0.24 m): deep pine-green paper label (`#3E7D4F`) with **one cream band** just under the lid, a **bone-in ham picture** (rosy meat, cream bone with a two-knob end, leaning up to the right) toward the viewer, silver rolled seams + lid, and a **rolled key on the right end** (a little loop the round fish can does not have) |
| Frame | 72 × 72, anchor `[0.5, 0.75]` (px 36, 54) — the same as `item_can`; trimmed 38 × 28 at (442, 0) on the page |
| Manifest | `kind: item`, `frameSize [72, 72]`, `topPx 19`, **`stackStep 13`** (fish can 14; ≤ 14 as required), `icon: true`, `carryScale 0.65`, `thicknessM 0.24`, `notes` |
| Page | `bld_items` 440 × 52 → **480 × 52**; the 8 old frames and the whole old 440 × 52 region decode **byte-identical** (below) |
| Files | **+0 game files** (the page's PNG + JSON and the manifest already existed). Tool / doc files only |
| Texture | +8,320 B (480·52·4 − 440·52·4) = **+0.008 MiB**, resident from boot (`EAGER_KEYS`) |
| Download | `bld_items.png` 6,294 B → 19,187 B (RGBA instead of a full 255-colour palette, see "Format"); kept as PNG in the build (`lossless`) |

`Assets.has('item_can_meat')` is now true, so the spec's "the pad needs the art" gate (`M8`, K-M7) is satisfied as soon as the
code lands. Nothing draws the meat can until the code uses the key.

## How `item_can` was made, and the same pipeline here

`item_can` is `@bld('item_can', 'item', 'bld_items', item={'thickness': 0.26}, samples=64)` in
`tools/blender/bld_assets.py` (`can_model` + `can_mat`), rendered by `tools/blender/bld_render.py` (shared camera,
key/fill suns and PPU 64 of `bl_common` / `prop_lib`, the 72 × 72 item frame with the anchor at (36, 54),
`_ground_item` = lie on the ground, turn 45° so +X runs screen-right, centre on the anchor), then post-processed by
`bld_pack.py` (`pack_utils.clean_alpha(floor=3)`, **no ink outline** — only the boats get one) and packed into
`bld_items` (later palettised with libimagequant).

The meat can uses exactly that: a new builder `@bld('item_can_meat', 'item', 'bld_items', item={'thickness':
MEAT_TIN['H']}, samples=64)` (`meat_tin_model` + `tin_mat` = the `can_mat` recipe with one band + `ham_decal`), rendered
with the stock command into a scratch cache:

```
/tmp/bvenv/bin/python tools/blender/bld_render.py -- item_can_meat --cache <cache>      # Blender 5.2.2 (bpy module)
```

Proof that the pipeline still matches the shipped fish can: re-rendering `item_can` with the same command lands on the
same bounding box (20, 31)–(51, 62) as the shipped frame, mean difference 6/255 a channel (the shipped frame went through
the 256-colour palette). The meat-can render is deterministic (two renders: identical pixels).

## Look-dev (what changed and why)

Variants were rendered with the real pipeline (a scratch script that overrides `MEAT_TIN` and calls
`bld_render.render_build`) and judged beside `item_can`, raw meat, smoked meat, ingot and coin at x4, 1x, the phone
zooms and as 28 / 48 px icons on snow, the cream panel, night and the dark UI.

1. **v1** (0.46 × 0.29 × 0.205 m, spin −20/0/−35°): a big silver lid dominated; the ham read as "a bone with a red dot";
   frontal (0°) looked flat, −35° showed too much end. → −20°.
2. **v2** (0.40 × 0.22 × 0.24 m, band top / mid / low): the shallower depth shrinks the lid, the taller face gives the
   label room; the bone ran off the rounded corner. Band under the lid read cleanest (mid band = busy stripes).
3. **v3** (new ham: meat oval + thin dark rim + soft shine, short bone with two knobs, lean 0–15°): reads as a
   drumstick at x4 and as "red meat + white bone" at 48 px; the fat curl of v2 smeared at small sizes and was dropped.
4. **v4 (shipped)**: ham 1.27× and leaning 8°; the print colours lifted (`#DA6457` meat, `#FFF4DE` bone) because the
   label face renders ~15 % darker than its swatch — exactly like the fish can's red (`#D9483B` renders `#B64D4B`) —
   so the RENDERED ham lands near the spec's `#C2564A` / `#F2E6D0`. The label stays the spec's `#3E7D4F` (renders
   `#477259`).

Reading at small sizes (see `meatcan_icons.png`): at 28 px the meat can is the only green tin, rectangular with a loop,
with a red-and-white dot — apart from the red round fish can, the bare grey ingot (the green label covers most of the
side, so it never reads as bare metal), the brown smoked ham and the gold coin; at 48 px the bone-in ham is clear.

Deviations from the spec's art line, on purpose: **thicknessM 0.24** (spec "≈ 0.2") — 0.2 gives stackStep 11, outside the
spec's own "12–14", and a taller face is what makes the ham readable; size 0.40 × 0.22 × 0.24 m (spec ≈ 0.40 × 0.26 ×
0.20); `topPx 19` (spec "≈ 20"). Stack slot heights do not change: `ItemStack.ensureBake` takes the largest stackStep of a
stack's types, and the fish can's 14 stays the largest in the cannery output.

## The merge: one frame, old frames untouched

New tool `tools/blender/bld_item_merge.py` (no Blender; numpy + Pillow):

```
python3 tools/blender/bld_item_merge.py item_can_meat --cache <cache>
python3 tools/blender/bld_item_merge.py --verify <old bld_items.png> <old bld_items.json>
```

It applies bld_pack's own item post + trim, pastes the old page's decoded pixels unchanged at (0, 0), appends the new
frame 2 px right of the right-most frame, keeps every old atlas entry as-is (same order) and writes the manifest entry
with `bld_pack.sprite_entries` (what a full repack would write). Guard before/after: sha256 of every old frame's decoded
RGBA + its atlas entry, the whole old region, the new frame against the render, and "nothing else on the page"; on any
mismatch the three files are restored. A re-run is idempotent (byte-identical output). A full `bld_pack.py` repack also
knows the key now (`ORDER`), and `bld_check.py` checks it as an item (`ITEMS`).

Against the published v4.2 page (`git show aa169bd:frost-village/assets/buildings/bld_items.{png,json}`):

| frame | sha256 of the decoded RGBA (first 16) | atlas entry |
|---|---|---|
| item_can | `4f423e150c60f069` | identical |
| item_fish_big | `23591f626a49f9a4` | identical |
| item_axe | `2ae9346c7a42ef82` | identical |
| item_pickaxe | `772e1b3a7d362164` | identical |
| item_rod | `7590795dfacd589e` | identical |
| item_sickle | `47e98a03c84674cd` | identical |
| item_bow | `755ddf053769e563` | identical |
| item_toolbox | `7dad655db37e2a10` | identical |
| whole old region 440 × 52 | `c47d6658ef92a4d1` before = after | — |
| **item_can_meat** (new) | `6c476f151dbf1785` | x 442, y 0, 38 × 28, source (17, 33) of 72 × 72 |

The 2 px gap (x 440–441) and everything below the new frame are fully transparent. `bld_check.py`: **30 sprites
(30 required), 0 errors, 0 warnings**.

### Format

The v4.2 page was a palette PNG using 255 of its 256 colours, so a palette PNG cannot take a new green/red/cream frame
without re-quantising — i.e. changing — the old frames. The page is now an **RGBA PNG** (every old pixel decodes to the
same RGBA as before; the GPU texture was RGBA anyway). The manifest's `bld_items` atlas entry carries **`lossless: true`**
(+ a note): `tools/build/webp_assets.py` then keeps the page as this PNG (checked on a copy: 0 conversions), so the old
frames stay byte-identical in the artifact too. Without the flag the build would turn it into a lossy WebP (9,034 B).
Cost: +12.9 KB of download. If someone ever does a full `bld_pack.py` repack, the atlas list is regenerated without
the flag — fine then, because everything is re-rendered anyway.

## In-game check (real Phaser renderer)

Headless Chromium (SwiftShader), phone viewport 390 × 844, the current tree, a new game: the `bld_items` texture loads as
480 × 52 with all 9 frame names, `Assets.has('item_can_meat')` is true, `Assets.image(…, 'item_can_meat')` gives the
72 × 72 frame with origin (0.5, 0.75), the chief carries 2 fish cans + 3 meat cans (`__FV.carry`), and the page has no
asset warnings, page errors or 404s. Shot: `docs/previews/meatcan/meatcan_ingame_check.png` (a test placement at camera
zoom 1.2: fish can, meat can, raw meat … in a row by the snow fort, a 3-high meat-can stack, the chief's carried stack).

Texture budget (`tools/test/texbudget.mjs --out <scratch>`, the current tree incl. other v4.2.1 work in progress, on a
machine shared with other runs): **every must passes** — new game 205.5 (≤ 368), v3.5 village 327.8 (≤ 455), full v4
any view **409.6 (≤ 455)**, GL total 446.4 (≤ 455), GL vs source-sum 1 %, render targets 33.7, 0 page errors. The
long-standing soft targets miss as in the v4.2 verify (title 123.8 / 90 — the same value as the v4.2 review run; plaza
345.7 / 300; tour 409.6 / 300). "Back to the start of the tour within 5 MiB" missed this run (345.7 → 354.5): the
difference is ground-bake slots (`fv_gslot_*`) and townsfolk social pages coming and going (the tool lists them);
`bld_items` is resident from boot to the end in both samples, so the meat can adds a constant 0.008 MiB and cannot
move that number. Worth one re-run in the lead's verify on a quiet machine.

## Previews (`docs/previews/meatcan/`, made by `tools/blender/bld_meatcan_preview.py` from the shipped atlases)

| file | what |
|---|---|
| `meatcan_compare.png` | fish can vs meat can at 100 % and x4; both on the snow at camera zoom 0.6 / 1.0 / 1.2 / 1.7 × render scale 1.5 (device pixels of a ~400 px phone), day and night |
| `meatcan_icons.png` | 28 / 48 / 72 px icons (longest side = size, as the HUD) beside fish can, raw meat, smoked meat, ingot, coin — on snow, the cream panel, night, dark UI; the customer's want bubble at 100 % and ×1.8 |
| `meatcan_stack.png` | 1–6 high stacks of both cans (step 14 / 13), the cannery output's twin towers holding both cans on the output pad, a porter carrying 4 meat cans |
| `meatcan_scene.png` | in-game-like: the cannery with both cans on its output pad, a porter carrying meat cans, a 잡화점 customer whose bubble wants a meat can — day / night |
| `meatcan_scene_phone.png` | the same corner at the phone's device pixels (zoom 1.2 × 1.5), day / night |
| `meatcan_ingame_check.png` | the real renderer (see above) |

## Files

- `tools/blender/bld_assets.py` — `MEAT_TIN`, `tin_mat`, `rrect`, `_oval`, `ham_decal`, `meat_tin_model`, `@bld('item_can_meat', …)` (appended; nothing else changed, the old builders are untouched)
- `tools/blender/bld_item_merge.py` — **new**: the one-frame merge + guard + `--verify`
- `tools/blender/bld_meatcan_preview.py` — **new**: the previews above
- `tools/blender/bld_pack.py` — `ORDER` + `item_can_meat`
- `tools/blender/bld_check.py` — `ITEMS` + `item_can_meat`
- `assets/buildings/bld_items.png`, `assets/buildings/bld_items.json` — the merged page
- `assets/buildings/manifest.json` — the `item_can_meat` sprite entry; `bld_items` atlas `lossless` + note
- `docs/previews/meatcan/*.png` (6), this report

## For the code side

- Draw it by key like the fish can: stacks (`ItemStack` / `StackBaker`), flying items, want bubbles, order chips, pad
  icons all work from the manifest entry; no shelf / HUD / packed-page variant exists or is needed (spec A2–A5).
- `stackStep 13` ≤ 14: the cannery output's baked slot height is unchanged with `bakeTypes ['item_can', 'item_can_meat']`.
- The 물류창고 rack keeps the default `cardboard_box_m` for it (spec A4, optional later).

## 디자이너용 한 줄 설명

**고기 통조림 그림이 생겼어요.** 생선 통조림(빨간 동그란 캔)과 같은 방법·같은 빛으로 그렸고, 모양은 **납작한 네모 캔**,
**초록 종이**에 **크림색 띠 하나**, 앞에 **뼈 붙은 고기 그림**, 오른쪽 끝에 **따개 고리**가 있어요. 작은 아이콘(28 px)으로
봐도 "초록 네모 캔 + 빨간 고기"라서 생선 통조림·생고기·훈제 고기·주괴·동전과 헷갈리지 않아요. 쌓으면 한 칸이 13 px
(생선 통조림 14 px)이라 진열대·작업대 칸 크기는 그대로예요. 원래 있던 그림(생선 통조림, 참치, 도구 5개, 공구 상자)은
**한 점도 바뀌지 않았어요**(픽셀을 하나하나 비교해서 확인). 미리 보기: `docs/previews/meatcan/` 폴더.
