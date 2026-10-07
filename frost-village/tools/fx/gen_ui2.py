"""
gen_ui2.py - builds assets/ui2/ for Frost Village v2-v3 (CONTRACT_V3 §F): new iso floor pads, 96 px icons,
build-menu card 9-slices, the packed-snow cobble road + its edge strip, the territory fog wall (3 parallax
layers + a clearing puff) and the new FX sheets.  numpy + Pillow (+ imagequant), deterministic.

The art lives in three library modules next to this file (all import fxlib.py and the existing
generators READ-ONLY - gen_ui.py, gen_fx.py, gen_ground.py, emote_art.py are never edited):
    ui2_art.py      pads, icons, cards
    ui2_ground.py   ground_road, road_edge, fog_bank / fog_bank_mid / fog_bank_front, fog_puff
    ui2_fx.py       fx_build_dust, fx_build_done, fx_wake (+ fx_wake_ring), fx_fire_big

Re-run (from anywhere; ~2-3 min on one shared core incl. previews + GIFs):
    python3 frost-village/tools/fx/gen_ui2.py                      # build everything + previews + GIFs
    python3 frost-village/tools/fx/gen_ui2.py --no-gif             # skip the preview GIFs
    python3 frost-village/tools/fx/gen_ui2.py --only ui_pad_boat,fx_wake
                                       # scratch previews only -> tools/fx/_cache/ui2/ (assets untouched)
    python3 frost-village/tools/fx/check_ui2.py                    # validate (exit code 0 = OK)
Outputs:
    assets/ui2/ui2_icons.png/.json     atlas: 12 icons + 6 pads (trimmed, Phaser JSON hash)
    assets/ui2/ui_card*.png            9-slice sources (plain images, margins in manifest.nineSlice)
    assets/ui2/ground_road.png         512 seamless texture
    assets/ui2/road_edge.png, fog_bank*.png, fog_puff.png
    assets/ui2/fx_*.png                spritesheets (frames left->right, wrapped at 2048 px)
    assets/ui2/manifest.json
    docs/previews/ui2_sheet.png, ui2_road_fog.png, ui2_fog_parallax.gif, fx_<sheet>.gif
"""
import argparse
import json
import math
import os
import sys

import numpy as np
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))          # frost-village/
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.dirname(HERE))              # tools/ (pack_utils)
import fxlib as F                                       # noqa: E402
import pack_utils                                       # noqa: E402
import gen_fx as GF                                     # noqa: E402  (grid_strip, read-only)
import gen_ui as GU                                     # noqa: E402  (nine_slice, read-only)
import ui2_art as ART                                   # noqa: E402
import ui2_ground as GR                                 # noqa: E402
import ui2_fx as FXS                                    # noqa: E402

ASSETS = os.path.join(ROOT, 'assets')
OUT = os.path.join(ASSETS, 'ui2')
PREV = os.path.join(ROOT, 'docs', 'previews')
CACHE = os.path.join(HERE, '_cache', 'ui2')

SNOW, PLAZA, SEA, DARK = (244, 247, 251), (217, 160, 138), (31, 95, 168), (46, 70, 110)
ISO_DEG = math.degrees(math.atan2(1, 2))                # 26.565: screen angle of the world axes

# ---------------------------------------------------------------- registry
ATLAS_ITEMS = dict(ART.ICONS)
ATLAS_ITEMS.update(ART.PADS)
NINE = ART.NINE
TEXTURES = {'ground_road': GR.tex_road}                 # float RGB (512, 512, 3)
STRIPS = {'road_edge': GR.road_edge, 'fog_bank': GR.fog_bank, 'fog_bank_mid': GR.fog_bank_mid,
          'fog_bank_front': GR.fog_bank_front}
PARTICLES = {'fog_puff': GR.fog_puff}
SHEETS = FXS.SHEETS

PAD_NOTES = {
    'clerk': 'pink, cash register + "+": hire a clerk for this counter',
    'porter': 'lime green, porter carrying crates on a back frame + "+": hire a porter for this line',
    'build': 'coral red, hammer + "+": empty building site, opens the build menu',
    'tower': 'violet, watchtower with a beacon fire: build the watchtower (expands the territory)',
    'boat': 'deep-sea indigo, sailing boat: buy / upgrade a boat at the pier',
    'register': 'teal, two footprints + coin: the spot where the chief / clerk stands to take payment',
}
ICON_NOTES = {
    'ui_icon_zoom_in': 'Magnifier with a green plus (zoom in).',
    'ui_icon_zoom_out': 'Magnifier with a red minus (zoom out).',
    'ui_icon_map': 'Folded parchment map with a red pin (overview / "show all").',
    'ui_icon_hammer': 'Claw hammer (build menu / construction).',
    'ui_icon_house': 'Snowy log cabin (houses / housing capacity).',
    'ui_icon_people': 'Three villager heads in yellow/red/blue parka hoods (population).',
    'ui_icon_clerk': 'Shop clerk bust: red-white headscarf + striped apron.',
    'ui_icon_porter': 'Porter (orange beanie, green scarf) with a crate stack on a back frame.',
    'ui_icon_tools': 'Crossed axe + pickaxe (tools from the toolsmith).',
    'ui_icon_food': 'Bread loaf + smoked drumstick (miners\' food / food supply).',
    'ui_icon_happy': 'Smiling face (happiness).',
    'ui_icon_lock_open': 'Open gold padlock + twinkle (unlocked); pairs with ui/ui_icon_lock.',
}


# ---------------------------------------------------------------- small image helpers
def tiled(img, W, H, ox=0, oy=0):
    out = Image.new('RGBA', (W, H))
    w, h = img.size
    for y in range(-(oy % h), H, h):
        for x in range(-(ox % w), W, w):
            out.paste(img, (x, y))
    return out


def comp_mask(base, top, m):
    a = np.asarray(base).astype(np.float32)
    b = np.asarray(top).astype(np.float32)
    out = a * (1 - m[..., None]) + b * m[..., None]
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8), 'RGBA')


def on_bg(img, col):
    bg = Image.new('RGBA', img.size, tuple(col) + (255,))
    bg.alpha_composite(img)
    return bg


def tile_x_strip(im, layer, y, off):
    """Paste a horizontally seamless strip across the whole width of im at row y, scrolled by off px."""
    w = layer.width
    x = -(off % w)
    while x < im.width:
        if x < 0:
            im.alpha_composite(layer.crop((-x, 0, w, layer.height)), (0, y))
        else:
            im.alpha_composite(layer, (x, y))
        x += w


class AtlasReader:
    """Read-only access to existing atlases (props / characters / ui) for the preview composites."""

    def __init__(self):
        self.cache = {}

    def frame(self, folder, atlas, name):
        key = (folder, atlas)
        if key not in self.cache:
            try:
                j = json.load(open(os.path.join(ASSETS, folder, atlas + '.json'), encoding='utf-8'))
                im = Image.open(os.path.join(ASSETS, folder, atlas + '.png')).convert('RGBA')
                self.cache[key] = (j['frames'], im)
            except Exception:                         # noqa: BLE001 - previews must never fail on missing art
                self.cache[key] = None
        c = self.cache[key]
        if not c or name not in c[0]:
            return None
        fr = c[0][name]
        f, sss, src = fr['frame'], fr['spriteSourceSize'], fr['sourceSize']
        p = c[1].crop((f['x'], f['y'], f['x'] + f['w'], f['y'] + f['h']))
        full = Image.new('RGBA', (src['w'], src['h']))
        full.paste(p, (sss['x'], sss['y']))
        return full

    def sprite(self, folder, key):
        try:
            m = json.load(open(os.path.join(ASSETS, folder, 'manifest.json'), encoding='utf-8'))
            s = m['sprites'][key]
            return self.frame(folder, s['atlas'], s['frame']), s.get('anchor', [0.5, 0.5])
        except Exception:                             # noqa: BLE001
            return None, None

    def put(self, im, folder, key, x, y):
        spr, anc = self.sprite(folder, key)
        if spr is not None:
            im.alpha_composite(spr, (int(round(x - spr.width * anc[0])), int(round(y - spr.height * anc[1]))))
            return True
        return False


# ---------------------------------------------------------------- road drawing for previews
def road_geom(W, H, c0, axis, length, half_m=0.8):
    """(s, t, inside, L, hw) of a straight iso road: s = distance along the axis from c0, t = signed
    perpendicular distance (screen px).  axis 'A' (screen down-right) or 'B' (screen up-right), metres."""
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    d = np.array([2.0, 1.0] if axis == 'A' else [2.0, -1.0], np.float32) / math.sqrt(5)
    n = np.array([-d[1], d[0]], np.float32)
    s = (xx - c0[0]) * d[0] + (yy - c0[1]) * d[1]
    t = (xx - c0[0]) * n[0] + (yy - c0[1]) * n[1]
    L = length * 50.6                                   # 1 m along an iso axis = 50.6 screen px
    hw = half_m * 40.5                                  # 1 m across the other axis = 40.5 px perpendicular
    inside = ((np.abs(t) < hw) & (s > 0) & (s < L)).astype(np.float32)
    return s, t, inside, L, hw


def draw_roads(im, road, edge, roads, mask_out):
    """Lay roads like the game would: ground_road inside the union of all road bands, then road_edge strips
    sampled along every border (strip row = 32 + distance outside the border, road side toward the road),
    skipped where another road (or the plaza) is - so junctions stay open."""
    W, H = im.size
    geo = [road_geom(W, H, *r) for r in roads]
    union_m = np.clip(sum(g[2] for g in geo), 0, 1) * (1 - mask_out)
    im = comp_mask(im, tiled(road, W, H), union_m)
    e = np.asarray(edge).astype(np.float32) / 255.0
    base = np.asarray(im).astype(np.float32) / 255.0
    for j, (s, t, inside, L, hw) in enumerate(geo):
        others = np.clip(sum(g[2] for k, g in enumerate(geo) if k != j), 0, 1)
        row = np.clip(np.round(32 + (np.abs(t) - hw)), -1, 64).astype(np.int32)
        col = np.mod(np.round(s + (t < 0) * 173).astype(np.int32), 512)
        ok = (row >= 0) & (row < 64) & (s > 0) & (s < L) & (others < 0.5) & (mask_out < 0.5)
        samp = e[np.clip(row, 0, 63), col]
        a = samp[..., 3] * ok
        base[..., :3] = base[..., :3] * (1 - a[..., None]) + samp[..., :3] * a[..., None]
    return Image.fromarray((np.clip(base, 0, 1) * 255 + 0.5).astype(np.uint8), 'RGBA')


def iso_diamond_mask(W, H, cx, cy, half_m):
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    u = ((xx - cx) / 45.25 + (yy - cy) / 22.63) / 2
    v = ((xx - cx) / 45.25 - (yy - cy) / 22.63) / 2
    return np.clip((half_m - np.maximum(np.abs(u), np.abs(v))) * 30, 0, 1).astype(np.float32)


# ---------------------------------------------------------------- previews
def label(dr, xy, text, fill=(40, 44, 56, 255)):
    dr.text(xy, text, fill=fill)


def preview_sheet(icons, nine, sheets, puff):
    """ui2_sheet.png: pads (new + existing for comparison) on snow & plaza; icons on snow / plaza / dark,
    on blue buttons, at 48 / 32 px; build-menu mock-up with the card 9-slices; fog_puff; FX strips."""
    W = 1500
    rows_fx = sum((fh if fw <= 160 else fh // 2) + 26 for (fn, fw, fh, n, *_r) in SHEETS.values())
    H = 1540 + rows_fx
    sh = Image.new('RGBA', (W, H), (0, 0, 0, 255))
    dr = ImageDraw.Draw(sh)
    snow_t = Image.open(os.path.join(ASSETS, 'ground', 'ground_snow.png')).convert('RGBA')
    plaza_t = Image.open(os.path.join(ASSETS, 'ground', 'ground_plaza.png')).convert('RGBA')
    sh.paste(tiled(snow_t, W, 560), (0, 0))
    sh.paste(tiled(plaza_t, W, 470), (0, 560))
    sh.paste(Image.new('RGBA', (W, 500), DARK + (255,)), (0, 1030))
    label(dr, (10, 6), 'ui2_sheet - CONTRACT_V3 F: new pads (top row) + existing pads for comparison, on ground_snow; '
                      'icons; build-menu cards (9-slice) | plaza row | dark row: icons on buttons, 48/32 px, fog_puff | FX strips')
    rd = AtlasReader()
    pads = list(ART.PADS)
    for i, k in enumerate(pads):
        sh.alpha_composite(icons[k], (16 + i * 246, 26))
        label(dr, (16 + i * 246 + 40, 122), k)
    old = ['ui_pad_unlock', 'ui_pad_input', 'ui_pad_output', 'ui_pad_cash', 'ui_pad_hire', 'ui_pad_upgrade']
    for i, k in enumerate(old):
        p, _ = rd.sprite('ui', k)
        if p is not None:
            sh.alpha_composite(p, (16 + i * 246, 140))
    label(dr, (16, 236), 'existing ui/ pads (unchanged) for colour / style comparison')
    keys = list(ART.ICONS)
    for i, k in enumerate(keys):
        sh.alpha_composite(icons[k], (14 + i * 122, 256))
        label(dr, (14 + i * 122, 352), k[8:])
    # build menu mock-up on snow: panel + 3 cards (one selected) with icons / props inside
    pan = GU.nine_slice(Image.open(os.path.join(ASSETS, 'ui', 'ui_panel.png')).convert('RGBA'), 720, 186,
                        dict(left=22, right=22, top=22, bottom=30))
    sh.alpha_composite(pan, (14, 368))
    m = ART.CARD_MARGINS
    contents = [('ui_icon_house', 'worker_hut'), ('ui_icon_tools', 'upgrade_bench'), ('ui_icon_hammer', 'market_counter'),
                ('ui_icon_people', 'tent_a')]
    for i, (ic, prop) in enumerate(contents):
        key = 'ui_card_selected' if i == 1 else 'ui_card'
        card = GU.nine_slice(nine[key], 150, 158, m)
        x, y = 34 + i * 170, 380
        sh.alpha_composite(card, (x, y))
        spr, anc = rd.sprite('props', prop)
        if spr is not None:
            s = min(112 / spr.width, 92 / spr.height)
            spr = spr.resize((max(1, int(spr.width * s)), max(1, int(spr.height * s))), Image.LANCZOS)
            sh.alpha_composite(spr, (x + 75 - spr.width // 2, y + 18))
        sh.alpha_composite(icons[ic].resize((40, 40), Image.LANCZOS), (x + 14, y + 108))
        dr.rounded_rectangle((x + 58, y + 116, x + 132, y + 132), 7, fill=(255, 200, 61, 255))
    label(dr, (40, 540), 'build menu mock-up: ui_card x3 + ui_card_selected stretched to 150x158 inside ui_panel '
                         '(game draws names / costs)')
    # card stretch tests: source size and a big stretch, plain + selected
    x = 760
    for key in ('ui_card', 'ui_card_selected'):
        for (w, h) in ((112, 128), (176, 176)):
            sh.alpha_composite(GU.nine_slice(nine[key], w, h, m), (x, 372))
            x += w + 14
    label(dr, (760, 552), 'ui_card / ui_card_selected at source size 112x128 and stretched to 176x176')
    # plaza row
    y0 = 580
    for i, k in enumerate(pads):
        sh.alpha_composite(icons[k], (16 + i * 246, y0))
    for i, k in enumerate(keys):
        sh.alpha_composite(icons[k], (14 + i * 122, y0 + 110))
    for i, k in enumerate(['ui_card', 'ui_card_selected']):
        sh.alpha_composite(GU.nine_slice(nine[k], 220, 150, m), (20 + i * 240, y0 + 230))
    sh.alpha_composite(puff, (520, y0 + 240))
    sh.alpha_composite(puff.resize((64, 64), Image.LANCZOS), (660, y0 + 272))
    label(dr, (520, y0 + 380), 'fog_puff (128 + 64 px)')
    # dark row: icons raw, on blue buttons, at 48 / 32 px
    y1 = 1046
    for i, k in enumerate(keys):
        sh.alpha_composite(icons[k], (14 + i * 122, y1))
    btn = Image.open(os.path.join(ASSETS, 'ui', 'ui_button_blue.png')).convert('RGBA')
    for i, k in enumerate(keys):
        b = GU.nine_slice(btn, 104, 88, dict(left=32, right=32, top=32, bottom=36))
        sh.alpha_composite(b, (10 + i * 122, y1 + 112))
        sh.alpha_composite(icons[k].resize((64, 64), Image.LANCZOS), (30 + i * 122, y1 + 118))
    for i, k in enumerate(keys):
        sh.alpha_composite(icons[k].resize((48, 48), Image.LANCZOS), (14 + i * 122, y1 + 226))
        sh.alpha_composite(icons[k].resize((32, 32), Image.LANCZOS), (70 + i * 122, y1 + 234))
    snow_strip = tiled(snow_t, 12 * 122, 64)
    sh.alpha_composite(snow_strip, (0, y1 + 290))
    for i, k in enumerate(keys):
        sh.alpha_composite(icons[k].resize((48, 48), Image.LANCZOS), (14 + i * 122, y1 + 298))
        sh.alpha_composite(icons[k].resize((32, 32), Image.LANCZOS), (70 + i * 122, y1 + 306))
    label(dr, (14, y1 + 360), 'icons on blue buttons (64 px) and at 48 / 32 px on dark and on snow', (220, 226, 236, 255))
    for i, k in enumerate(pads):
        sh.alpha_composite(icons[k].resize((96, 48), Image.LANCZOS), (14 + i * 122, y1 + 384))
    label(dr, (14, y1 + 436), 'pads at half size (zoomed-out map)', (220, 226, 236, 255))
    sh.alpha_composite(puff.resize((96, 96), Image.LANCZOS), (900, y1 + 380))
    # FX strips on alternating backgrounds
    y = 1540
    dr.rectangle((0, 1530, W, H), fill=(200, 208, 220, 255))
    for k, frames in sheets.items():
        fn, fw, fh, n, fps, rep, anc, _ = SHEETS[k]
        bgs = [SEA, (47, 134, 201), (23, 74, 134)] if 'wake' in k else [SNOW, PLAZA, SEA]
        scale = 1 if fw <= 160 else 0.5
        x = 8
        for j, f in enumerate(frames):
            ff = f if scale == 1 else f.resize((int(fw * scale), int(fh * scale)), Image.LANCZOS)
            if x + ff.width > W - 120:
                break
            sh.alpha_composite(on_bg(ff, bgs[j % 3]), (x, y))
            x += ff.width + 3
        label(dr, (W - 116, y + 4), k)
        label(dr, (W - 116, y + 18), '%d f %d fps %s' % (n, fps, 'loop' if rep == -1 else 'once'))
        y += int(fh * scale) + 26
    return sh.crop((0, 0, W, y)).convert('RGB')


def road_fog_scene(texs, strips, icons, frame_t=0):
    """ui2_road_fog.png: ground_snow + ground_plaza + ground_road (with road_edge strips) as the game would
    lay them out, props for scale, the 3 fog layers hiding the land beyond the border, pads on the road."""
    W, H = 1280, 820
    snow_t = Image.open(os.path.join(ASSETS, 'ground', 'ground_snow.png')).convert('RGBA')
    plaza_t = Image.open(os.path.join(ASSETS, 'ground', 'ground_plaza.png')).convert('RGBA')
    im = tiled(snow_t, W, H)
    rd = AtlasReader()
    # trees beyond the border (hidden by the fog)
    for i, x in enumerate(range(30, W, 120)):
        rd.put(im, 'props', ['tree_pine_snow', 'tree_pine_a', 'tree_pine_b'][i % 3], x + (i % 2) * 30, 110 + (i % 3) * 30)
    pcx, pcy = 420, 600                                 # plaza 6 x 6 m
    plaza_m = iso_diamond_mask(W, H, pcx, pcy, 3.0)
    im = comp_mask(im, tiled(plaza_t, W, H), plaza_m)
    road = texs['ground_road'].convert('RGBA')
    ne = (pcx + 3 * 45.25, pcy - 3 * 22.63)            # middle of the plaza's NE side
    se = (pcx + 3 * 45.25, pcy + 3 * 22.63)            # middle of the plaza's SE side
    spur0 = (se[0] + 3.6 * 45.25, se[1] + 3.6 * 22.63)
    roads = [((ne[0] - 45.25, ne[1] + 22.63), 'B', 10.5),          # start 1 m inside the plaza (hidden by it)
             ((se[0] - 45.25, se[1] - 22.63), 'A', 8.0), (spur0, 'B', 3.0, 0.7)]
    im = draw_roads(im, road, strips['road_edge'], roads, plaza_m)
    # props, pads and villagers for scale
    for key, x, y in [('tree_pine_snow', 90, 560), ('tree_pine_a', 160, 700), ('market_counter', 330, 570),
                      ('lamp_post', 600, 470), ('signpost', 720, 600), ('crate', 500, 720), ('barrel', 525, 740),
                      ('worker_hut', 1150, 470), ('tree_pine_snow', 1225, 760), ('tree_pine_a', 80, 380)]:
        rd.put(im, 'props', key, x, y)
    sp_end = (spur0[0] + 3.0 * 45.25, spur0[1] - 3.0 * 22.63)
    for key, x, y in [('ui_pad_build', sp_end[0] + 0.9 * 45.25, sp_end[1] - 0.9 * 22.63), ('ui_pad_tower', 1000, 330),
                      ('ui_pad_porter', se[0] + 80, se[1] + 100), ('ui_pad_register', 470, 560),
                      ('ui_pad_clerk', 250, 640)]:
        p = icons[key]
        im.alpha_composite(p, (int(x - p.width / 2), int(y - p.height / 2)))
    for name, x, y in [('walk_SE_2', se[0] + 2.0 * 45.25, se[1] + 2.0 * 22.63 + 6), ('walk_NE_3', ne[0] + 4 * 45.25,
                                                                                 ne[1] - 4 * 22.63 + 4)]:
        fr = rd.frame('characters', 'char_villager_a', name)
        if fr is not None:
            im.alpha_composite(fr, (int(x - 64), int(y - 104)))
    # fog: flat fill beyond, wall, mid band, front wisps (as the game stacks them)
    fill = Image.new('RGBA', (W, 40), GR.FOG_FILL)
    im.alpha_composite(fill, (0, 0))
    tile_x_strip(im, strips['fog_bank'], 20, 60 + frame_t * 6)
    tile_x_strip(im, strips['fog_bank_mid'], 20 + 56, 200 + frame_t * 13)
    tile_x_strip(im, strips['fog_bank_front'], 20 + 216, 300 + frame_t * 30)
    return im


def fog_gif(strips, path, frames=20):
    """Fog parallax loop: the three layers scrolling at 1x / 2x / 4x (20 frames at 10 fps)."""
    W, H = 520, 320
    snow_t = Image.open(os.path.join(ASSETS, 'ground', 'ground_snow.png')).convert('RGBA')
    rd = AtlasReader()
    base = tiled(snow_t, W, H)
    for i, x in enumerate(range(20, W, 110)):
        rd.put(base, 'props', 'tree_pine_snow' if i % 2 else 'tree_pine_a', x, 160 + (i % 2) * 40)
    for i, x in enumerate(range(60, W, 160)):
        rd.put(base, 'props', 'tree_pine_snow', x, 310)
    out = []
    for f in range(frames):
        im = base.copy()
        im.alpha_composite(Image.new('RGBA', (W, 30), GR.FOG_FILL), (0, 0))
        u = f / frames
        tile_x_strip(im, strips['fog_bank'], 10, int(round(u * 512)))
        tile_x_strip(im, strips['fog_bank_mid'], 66, int(round(u * 1024)))
        tile_x_strip(im, strips['fog_bank_front'], 226, int(round(u * 2048)))
        out.append(im.convert('RGB').quantize(255, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE))
    out[0].save(path, save_all=True, append_images=out[1:], duration=100, loop=0, optimize=False, disposal=1)


# ---------------------------------------------------------------- manifest helpers
def fog_metrics(img):
    """Rows (from the top) that are fully opaque, and the lowest row where the fog body is still >= 50 %."""
    a = np.asarray(img)[..., 3].astype(np.float32) / 255.0
    rows_min = a.min(axis=1)
    rows_mean = a.mean(axis=1)
    opaque = int(np.argmax(rows_min < 0.995)) if (rows_min < 0.995).any() else img.height
    body = int(np.nonzero(rows_mean >= 0.5)[0].max()) + 1 if (rows_mean >= 0.5).any() else 0
    return opaque, body


def build(only=None, gifs=True):
    want = lambda k: (not only) or (k in only)
    icons, nine, texs, strips, parts, sheets = {}, {}, {}, {}, {}, {}
    for k, fn in ATLAS_ITEMS.items():
        if want(k):
            icons[k] = fn()
            print('  icon/pad', k, icons[k].size, flush=True)
    for k, (fn, m) in NINE.items():
        if want(k):
            nine[k] = fn()
            print('  9-slice', k, nine[k].size, flush=True)
    for k, fn in TEXTURES.items():
        if want(k):
            texs[k] = F.to_rgb_image(fn())
            print('  texture', k, texs[k].size, flush=True)
    for k, fn in STRIPS.items():
        if want(k):
            strips[k] = fn()
            print('  strip', k, strips[k].size, flush=True)
    for k, fn in PARTICLES.items():
        if want(k):
            parts[k] = fn()
            print('  particle', k, parts[k].size, flush=True)
    for k, (fn, fw, fh, n, fps, rep, anc, note) in SHEETS.items():
        if want(k):
            sheets[k] = [fn(i, n) for i in range(n)]
            for f in sheets[k]:
                assert f.size == (fw, fh), (k, f.size)
            print('  sheet', k, n, 'x', (fw, fh), flush=True)

    if only:
        os.makedirs(CACHE, exist_ok=True)
        items = list(icons.items()) + list(nine.items()) + list(parts.items()) + \
            [(k, v.convert('RGBA')) for k, v in texs.items()] + list(strips.items())
        if items:
            cw = max(i.width for _, i in items) + 12
            chh = max(i.height for _, i in items) + 12
            sheet = Image.new('RGBA', (cw * 3, chh * len(items)), (0, 0, 0, 255))
            for j, (k, im) in enumerate(items):
                for b, col in enumerate((SNOW, PLAZA, DARK)):
                    bg = Image.new('RGBA', (cw, chh), col + (255,))
                    bg.alpha_composite(im, (6, 6))
                    sheet.alpha_composite(bg, (b * cw, j * chh))
            sheet.save(os.path.join(CACHE, 'ui2_only.png'))
            print('  preview ->', os.path.join(CACHE, 'ui2_only.png'))
        for k, frames in sheets.items():
            d = SHEETS[k]
            panels = ('#1F5FA8', '#2F86C9', '#174A86') if 'wake' in k else ('#F4F7FB', '#D9A08A', '#1F5FA8')
            F.save_gif(frames, os.path.join(CACHE, k + '.gif'), d[4], panels=panels, hold=0 if d[5] == -1 else 6,
                       anchor=d[6])
            print('  gif ->', os.path.join(CACHE, k + '.gif'))
        return

    os.makedirs(OUT, exist_ok=True)
    # --- atlas (trimmed; anchors refer to the untrimmed frame)
    sheet, atlas = pack_utils.pack_atlas(list(icons.items()), max_width=1024, padding=2)
    F.save_png(sheet, os.path.join(OUT, 'ui2_icons.png'))
    atlas['meta']['image'] = 'ui2_icons.png'
    with open(os.path.join(OUT, 'ui2_icons.json'), 'w', encoding='utf-8') as f:
        json.dump(atlas, f, separators=(',', ':'))
    for k, im in nine.items():
        F.save_png(im, os.path.join(OUT, k + '.png'))
    for k, im in texs.items():
        F.save_png(im, os.path.join(OUT, k + '.png'), quant=256, dither=0.75)
    for k, im in strips.items():
        F.save_png(im, os.path.join(OUT, k + '.png'), quant=256, dither=0.6)
    for k, im in parts.items():
        F.save_png(im, os.path.join(OUT, k + '.png'), quant=256, dither=0.6)
    for k, frames in sheets.items():
        F.save_png(GF.grid_strip(frames, 2048), os.path.join(OUT, k + '.png'), quant=256, dither=0.6)

    # --- manifest
    man = {
        'version': 1,
        'generator': 'tools/fx/gen_ui2.py (ui2_art.py, ui2_ground.py, ui2_fx.py)',
        'conventions': {
            'text': 'No text is baked; the game renders all text.',
            'iconSize': [96, 96],
            'pads': 'ui_pad_* are 192x96 iso (2:1) diamonds like assets/ui pads: tip-to-tip ~170 px, anchor = centre, '
                    'footprint [170, 85]. White engraved symbol, colour-coded fill.',
            'iso': 'World axes run at +-%.3f deg on screen (A = down-right (2,1), B = up-right (2,-1)); 1 m along an '
                   'axis = 50.6 px, 1 m across = 40.5 px perpendicular.' % ISO_DEG,
            'blend': 'All FX sheets are NORMAL-blend artwork (ADD vanishes on snow).',
            'sheets': 'Frames left->right, wrapped into rows so no sheet is wider than 2048 px. Phaser anim key = sheet key.',
            'fogLayers': 'Back->front: fog_bank (wall, opaque top, scroll ~6 px/s), fog_bank_mid (draw ~56 px lower, '
                         '~13 px/s), fog_bank_front (draw ~216 px lower than the wall top, ~30 px/s). All tile in x (TileSprite.tilePositionX). '
                         'Fill everything beyond the wall with fog_bank.fillColor. When a watchtower clears an area: '
                         'tween the layers\' alpha to 0 (~0.8 s) and burst 10-20 fog_puff particles outward.',
        },
        'atlases': [{'key': 'ui2_icons', 'png': 'ui2/ui2_icons.png', 'json': 'ui2/ui2_icons.json'}],
        'images': [],
        'spritesheets': [],
        'sprites': {},
        'nineSlice': {},
    }
    for k, im in icons.items():
        e = {'atlas': 'ui2_icons', 'frame': k, 'anchor': [0.5, 0.5], 'kind': 'icon' if k.startswith('ui_icon_') else 'ui',
             'frameSize': list(im.size)}
        if k.startswith('ui_pad_'):
            e['footprint'] = [170, 85]
            kind = k[len('ui_pad_'):]
            e['colour'] = ART.PAD_COLOURS[kind]
            e['notes'] = 'Iso 2:1 floor pad (192x96), ' + PAD_NOTES[kind] + '. Diamond tip-to-tip ~170 px.'
        else:
            e['notes'] = ICON_NOTES.get(k, '')
        man['sprites'][k] = e
    for k, im in nine.items():
        mrg = NINE[k][1]
        man['images'].append({'key': k, 'png': 'ui2/%s.png' % k})
        man['sprites'][k] = {'image': k, 'anchor': [0.5, 0.5], 'kind': 'ui', 'frameSize': list(im.size),
                             'minSize': [mrg['left'] + mrg['right'] + 4, mrg['top'] + mrg['bottom'] + 4],
                             'contentInset': [16, 14, 16, 22],
                             'notes': ('Build-menu card (9-slice). ' if k == 'ui_card' else
                                       'Selected build-menu card: gold rim + glow + twinkle, same size/margins as ui_card. ')
                             + 'Recommended 120-220 px wide, 120-260 px tall; content inset [l, t, r, b] '
                               'keeps text off the rim and the bottom lip.'}
        man['nineSlice'][k] = {'image': k, 'left': mrg['left'], 'right': mrg['right'], 'top': mrg['top'],
                               'bottom': mrg['bottom']}
    for k, im in texs.items():
        man['images'].append({'key': k, 'png': 'ui2/%s.png' % k})
        arr = np.asarray(im).astype(np.float32) / 255.0
        man['sprites'][k] = {'image': k, 'anchor': [0.5, 0.5], 'kind': 'tile', 'tile': 'xy', 'frameSize': list(im.size),
                             'avgColour': '#%02X%02X%02X' % tuple(int(round(v * 255)) for v in arr.reshape(-1, 3).mean(0)),
                             'notes': 'Packed-snow cobble road, seamless 512 (cobbles are iso-foreshortened). Fill road '
                                      'cells with it at scale 1 (TileSprite / pattern), then lay road_edge along the borders.'}
    for k, im in strips.items():
        man['images'].append({'key': k, 'png': 'ui2/%s.png' % k})
        e = {'image': k, 'kind': 'decal' if k == 'road_edge' else 'fog', 'tile': 'x', 'frameSize': list(im.size)}
        if k == 'road_edge':
            e.update({'anchor': [0.5, 0.5], 'edgeLine': 32, 'roadSide': 'top',
                      'notes': 'Seamless in x (512x64). Centre line (y=32) on the road boundary, top half over the road, '
                               'bottom half fades into the snow. Along a world axis rotate by +-%.2f deg (flipY for the '
                               'opposite side); shading is mild so flips/rotations look right.' % ISO_DEG})
        else:
            opaque, body = fog_metrics(im)
            e.update({'anchor': [0.5, 0.0], 'opaqueRows': opaque, 'bodyBottom': body})
            if k == 'fog_bank':
                e.update({'fillColor': GR.FOG_FILL, 'parallax': {'order': 0, 'yOffset': 0, 'speed': 6},
                          'notes': 'Drifting snow-fog WALL (back layer, also fine alone): top %d rows fully opaque %s '
                                   '(continue with a rect of fillColor beyond), soft cloud banks, puffy lip ending '
                                   'near y=%d, faint cool ground shadow below. Anchor = top centre; place the wall so '
                                   'its lip sits just outside the territory border.' % (opaque, GR.FOG_FILL, body)})
            elif k == 'fog_bank_mid':
                e.update({'parallax': {'order': 1, 'yOffset': 56, 'speed': 13},
                          'notes': 'Mid fog band (transparent top) hanging in front of the wall lip; draw over '
                                   'fog_bank 56 px lower, scroll ~2x faster.'})
            else:
                e.update({'parallax': {'order': 2, 'yOffset': 216, 'speed': 30},
                          'notes': 'Front layer: drifting blowing-snow wisps + flakes over the border; draw last '
                                   '(~216 px below the wall top), scroll fastest. Optional.'})
        man['sprites'][k] = e
    for k, im in parts.items():
        man['images'].append({'key': k, 'png': 'ui2/%s.png' % k})
        man['sprites'][k] = {'image': k, 'anchor': [0.5, 0.5], 'kind': 'fx', 'tintable': False,
                             'frameSize': list(im.size),
                             'notes': 'Soft fog billow particle (light blue-white baked, feathered rim). Fog clearing: '
                                      'emit 10-20, scale 0.6->1.6, drift outward/up, alpha 1->0 over ~1 s.'}
    for k, frames in sheets.items():
        fn, fw, fh, n, fps, rep, anc, note = SHEETS[k]
        man['spritesheets'].append({'key': k, 'png': 'ui2/%s.png' % k, 'frameWidth': fw, 'frameHeight': fh,
                                    'frameCount': n, 'fps': fps, 'repeat': rep, 'anchor': anc, 'blend': 'NORMAL',
                                    'notes': note})
    with open(os.path.join(OUT, 'manifest.json'), 'w', encoding='utf-8') as f:
        json.dump(man, f, indent=1, ensure_ascii=False)

    # --- previews read back the saved files so they show exactly what ships
    if len(icons) == len(ATLAS_ITEMS) and len(nine) == len(NINE) and len(sheets) == len(SHEETS):
        os.makedirs(PREV, exist_ok=True)
        aj = json.load(open(os.path.join(OUT, 'ui2_icons.json'), encoding='utf-8'))['frames']
        ap = Image.open(os.path.join(OUT, 'ui2_icons.png')).convert('RGBA')
        icons_s = {}
        for k in icons:
            fr = aj[k]
            f_, sss, src = fr['frame'], fr['spriteSourceSize'], fr['sourceSize']
            full = Image.new('RGBA', (src['w'], src['h']))
            full.paste(ap.crop((f_['x'], f_['y'], f_['x'] + f_['w'], f_['y'] + f_['h'])), (sss['x'], sss['y']))
            icons_s[k] = full
        nine_s = {k: Image.open(os.path.join(OUT, k + '.png')).convert('RGBA') for k in nine}
        texs_s = {k: Image.open(os.path.join(OUT, k + '.png')).convert('RGBA').convert('RGB') for k in texs}
        strips_s = {k: Image.open(os.path.join(OUT, k + '.png')).convert('RGBA') for k in strips}
        puff_s = Image.open(os.path.join(OUT, 'fog_puff.png')).convert('RGBA')
        sheets_s = {}
        for k, frames in sheets.items():
            fn, fw, fh, n = SHEETS[k][:4]
            g = Image.open(os.path.join(OUT, k + '.png')).convert('RGBA')
            cols = max(1, min(n, g.width // fw))
            sheets_s[k] = [g.crop(((i % cols) * fw, (i // cols) * fh, (i % cols) * fw + fw, (i // cols) * fh + fh))
                           for i in range(n)]
        F.save_png(preview_sheet(icons_s, nine_s, sheets_s, puff_s), os.path.join(PREV, 'ui2_sheet.png'), quant=256,
                   dither=0.8)
        road_fog_scene(texs_s, strips_s, icons_s).convert('RGB').save(os.path.join(PREV, 'ui2_road_fog.png'),
                                                                        optimize=True)
        if gifs:
            fog_gif(strips_s, os.path.join(PREV, 'ui2_fog_parallax.gif'))
            for k, frames in sheets_s.items():
                d = SHEETS[k]
                panels = ('#1F5FA8', '#2F86C9', '#174A86') if 'wake' in k else ('#F4F7FB', '#D9A08A', '#1F5FA8')
                F.save_gif(frames, os.path.join(PREV, k + '.gif'), d[4], panels=panels,
                           hold=0 if d[5] == -1 else 8, anchor=d[6])
    print('ui2 done ->', OUT)


if __name__ == '__main__':
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--only', default='', help='comma separated keys -> scratch previews in tools/fx/_cache/ui2 only')
    ap.add_argument('--no-gif', action='store_true', help='skip the preview GIFs')
    a = ap.parse_args()
    only = set(k for k in a.only.split(',') if k) or None
    build(only, gifs=not a.no_gif)
