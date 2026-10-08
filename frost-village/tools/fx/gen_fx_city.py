"""
gen_fx_city.py - builder for assets/fx_city (CONTRACT_V8 §AC): city FX spritesheets (fire, smoke, embers, hose,
mist, steam, fight cloud, alarm, sirens, demolition dust, question / idea / memory) + the ui4 icon atlas and the
city panels (wanted poster, newspaper pieces, passbook, story cards).

Re-run (from anywhere; deterministic; ~2-4 min with 2 worker processes):
    python3 frost-village/tools/fx/gen_fx_city.py                  # everything: assets + manifest + previews
    python3 frost-village/tools/fx/gen_fx_city.py --no-gif         # skip the preview GIFs
    python3 frost-village/tools/fx/gen_fx_city.py --no-scene       # skip docs/previews/fxcity_scene.png
    python3 frost-village/tools/fx/gen_fx_city.py --only fx_fight_cloud,ui_icon_piggy   # scratch only
                                                                   #   -> <tmp>/fv_cache/fx_city/ (assets untouched)
    python3 frost-village/tools/fx/gen_fx_city.py --jobs 1         # worker processes (default 2)
Check:  python3 frost-village/tools/fx/check_fx_city.py
Art modules: gen_fx_city_fx.py (FX sheets), gen_ui4.py (icons + panels), gen_fx_city_scene.py (street mock-up),
gen_fx_city_preview.py (sheet / UI previews).  fxlib, gen_fx, gen_ui3, emote_art, ui2_art and pack_utils are
imported read-only.
Outputs:
    assets/fx_city/<fx key>.png           spritesheets (frames left->right, wrapped into rows at 2048 px)
    assets/fx_city/ui4_icons.png/.json    trimmed Phaser JSON-hash atlas (24 icons + ui_stamp_bank)
    assets/fx_city/<panel>.png            panels (plain images; 9-slice margins in manifest.nineSlice)
    assets/fx_city/manifest.json
    docs/previews/fxcity_sheet.png, fxcity_ui.png, fxcity_<fx key>.gif, fxcity_hose_arc.gif, fxcity_scene.png
"""
import argparse
import json
import os
import sys
import tempfile
import time
from concurrent.futures import ProcessPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.dirname(HERE))

OUT = os.path.join(ROOT, 'assets', 'fx_city')
PREV = os.path.join(ROOT, 'docs', 'previews')
CACHE = os.path.join(tempfile.gettempdir(), 'fv_cache', 'fx_city')
ATLAS = 'ui4_icons'


def _S(w, h, frames, fps, repeat, anchor, notes='', **kw):
    d = dict(w=w, h=h, frames=frames, fps=fps, repeat=repeat, anchor=anchor, notes=notes)
    d.update(kw)
    return d


FIRE_NOTE = ('Building fire loop: a wide crown of toy flame tongues over a glowing base that melts away at the '
             'bottom (sits on the roof / wall top), warm halo, licks tearing off the top and embers. Anchor = middle '
             'of the fire base. Add fx_smoke_column above it and fx_fire_window at 1-2 windows; fx_embers for big '
             'fires. Scale = 0.85 * building footprint width / baseWidthPx (clamp 0.7-1.3). See manifest.fireMount.')

SHEETS = {
    'fx_fire_bld_s': _S(208, 224, 16, 14, -1, [0.5, 0.86], FIRE_NOTE, baseWidthPx=140, heightPx=150,
                        plot='S (townhouses, small shops: footprint <= 280 px)'),
    'fx_fire_bld_m': _S(280, 288, 16, 14, -1, [0.5, 0.86], FIRE_NOTE, baseWidthPx=192, heightPx=200,
                        plot='M (shops, civic: footprint <= 380 px)'),
    'fx_fire_bld_l': _S(352, 352, 16, 14, -1, [0.5, 0.86], FIRE_NOTE, baseWidthPx=248, heightPx=255,
                        plot='L (apartments, big halls, warehouses)'),
    'fx_fire_window': _S(96, 144, 12, 14, -1, [0.5, 0.74],
                         'Flames licking out of a window and up the wall, with a flickering glow of the burning room. '
                         'Anchor = window centre (the bottom of the flames melts into the window). flipX freely.'),
    'fx_smoke_column': _S(224, 400, 16, 10, -1, [0.32, 0.95],
                          'Tall smoke plume loop: sooty billows from a glowing source (underside lit orange by the '
                          'fire) swell, drift right with the wind and turn light grey as they rise. Anchor = base '
                          'of the column: put it on top of the fire (fire anchor + [8, -0.55 * heightPx]). flipX for '
                          'wind from the other side; scale 0.5 for a starting fire or a smouldering ruin.'),
    'fx_embers': _S(128, 224, 16, 12, -1, [0.5, 0.96],
                    'Sparks / embers with short trails spiralling up. Anchor = bottom centre (on the fire). Use over '
                    'big fires and smouldering ruins.'),
    'fx_hose_stream': _S(32, 24, 8, 30, -1, [0.0, 0.5],
                         'Fire-hose water jet SEGMENT (one 32 px bead period), seamless in x, flowing toward +x by '
                         '4 px per frame. Chain '
                         'copies along an arc from the nozzle to the target (see manifest.hoseAim) or map it onto a '
                         'Phaser Rope. All segments play the same anim in sync.'),
    'fx_hose_rope': _S(256, 24, 8, 30, -1, [0.0, 0.5],
                       'Extra: the same flowing jet, 8 bead periods long, as the texture of a Phaser Rope laid along '
                       'the aimed arc (recommended on WebGL: smooth bends, one draw call; see manifest.hoseAim.rope).'),
    'fx_hose_tip': _S(96, 64, 8, 30, -1, [0.0, 0.5],
                      'Extra: end of the jet breaking up into a fan of droplets. Attach its anchor (left middle) to '
                      'the end of the last hose segment with the same rotation.'),
    'fx_water_mist': _S(160, 112, 12, 14, -1, [0.5, 0.6],
                        'Where the hose hits: translucent pale-blue spray cloud, splash flicks, falling droplets, '
                        'glints. Anchor = impact point. Pair with fx_steam_puff while the fire is still burning.'),
    'fx_steam_puff': _S(128, 192, 14, 16, 0, [0.5, 0.9],
                        'One-shot white steam billow (water meets fire): spawn every ~0.3-0.5 s near the impact '
                        'point (more often as the fire dies). Anchor = source.'),
    'fx_fight_cloud': _S(192, 176, 12, 14, -1, [0.5, 0.86],
                         'Cartoon scuffle loop: tumbling dust ball with fists and boots popping out, dizzy stars, '
                         'pow bursts, speed swooshes and kicked-up dust. Hide the two residents while it plays (see '
                         'manifest.fightGuide). Anchor = ground under the middle.'),
    'fx_alarm_flash': _S(128, 128, 8, 10, -1, [0.5, 0.5],
                         'Alarm loop: red lamp with "!" pulsing, red warning burst flashing, ringing arcs, ripple '
                         'ring. Anchor = centre. Use on fire_alarm_post, above a building in trouble, police calls.'),
    'fx_siren_glow_red': _S(128, 64, 8, 12, -1, [0.5, 0.5],
                            'Rotating beacon (red): light fan sweeping on the ground plane, lamp flares when it faces '
                            'the camera. Anchor = beacon (vehicles sirenPoint). Fire truck: red only; police car: '
                            'red + blue (blue is half a turn later - start both on the same frame).',
                            pair='fx_siren_glow_blue'),
    'fx_siren_glow_blue': _S(128, 64, 8, 12, -1, [0.5, 0.5],
                             'Rotating beacon (blue), half a turn after fx_siren_glow_red. Anchor = beacon.',
                             pair='fx_siren_glow_red'),
    'fx_demolish_dust': _S(256, 192, 16, 20, 0, [0.5, 0.78],
                           'One-shot demolition / collapse: dust ring rolls out on the ground, a cloud billows up, '
                           'planks, bricks and soot bits fly. Anchor = building footprint centre; scale x1.2-1.6 for '
                           'big plots; x0.6 for each excavator bucket hit.'),
    'fx_question_mark': _S(80, 112, 12, 10, -1, [0.5, 0.95],
                           'Curious resident loop: glossy blue "?" bobbing, little "?"s popping off. Anchor = head '
                           'top (character anchor + [0, -78]). Tween its scale in / out.'),
    'fx_lightbulb_idea': _S(96, 128, 14, 16, 0, [0.5, 0.95],
                            'One-shot "aha!": bulb pops up, flickers, lights with rays + sparkles, stays lit (hold '
                            'the last frame ~0.8 s, then fade). Anchor = head top.'),
    'fx_memory_sparkle': _S(112, 112, 16, 12, -1, [0.5, 0.9],
                            'Dreamy loop while a resident remembers: pastel twinkles and a ribbon spiral up in a soft '
                            'lilac glow. Anchor = head top.'),
}

HOSE_AIM = {
    'segment': 'fx_hose_stream', 'segmentLengthPx': 32, 'segmentThicknessPx': 10, 'stepPx': 32,
    'ropeTexture': 'fx_hose_rope', 'ropeLengthPx': 256,
    'tip': 'fx_hose_tip', 'impact': ['fx_water_mist', 'fx_steam_puff'],
    'arc': 'N = nozzle (cityfolk spray_hose nozzlePoint, or the fire truck hosePoint), T = target (fire anchor + '
           '[0, -0.3 * heightPx] or a window). Curve P(s) = N + (T - N) * s + [0, -h * 4 * s * (1 - s)] for s in '
           '0..1 with arc height h = clamp(0.3 * |T - N|, 20, 120) px (the jet arcs up, then falls onto the target).',
    'chain': 'Split the curve into n = ceil(length / stepPx) equal arc-length steps L (<= 32 px): at each step place '
             'a sprite of fx_hose_stream with origin (0, 0.5) at the step start, rotation = angle of the curve '
             'tangent there, scaleX = (L + 1) / 32 (the texture is seamless, +1 px hides hairline gaps at the bends), '
             'scaleY = 1.0 -> 0.7 along the arc (the jet thins). All segments play the same anim in sync. Depth: above '
             'the firefighter, below the building fire. Put fx_hose_tip at the end point with the last rotation and '
             'fx_water_mist at T. Re-aim every frame by recomputing the points (cheap: ~8 sprites).',
    'rope': 'RECOMMENDED on WebGL: rope = this.add.rope(N.x, N.y, "fx_hose_rope", 0, points) with points = P(s) - N '
            'sampled every ~12 px (s = 0..1) and rope.setFrame((frame + 1) % 8) at 30 fps (or follow the '
            'fx_hose_rope anim); setPoints() again when re-aiming. One draw call, perfectly smooth bends; the 256 px '
            'texture is mapped once over the arc, so 200-450 px jets keep about the bead size. Thin it toward the '
            'end with rope.setColors / a slightly smaller scaleY, add fx_hose_tip + fx_water_mist at T.',
    'chainNote': 'The segment chain works on every renderer (Canvas too) but shows faint joints at tight bends; '
                 'prefer the rope on WebGL.',
    'demo': 'tools/test/fx_city_phaser.mjs aims chained streams and ropes; gen_fx_city_scene.hose_rope() / '
            'hose_arc() are the Python versions of the rope / chain used by docs/previews/fxcity_scene.png and '
            'fxcity_hose_arc.gif.',
}

FIRE_MOUNT = {
    'pick': 'Pick the fire sheet from the building footprint width fw = sprites[k].footprint[0]: fw <= 280 -> '
            'fx_fire_bld_s, fw <= 380 -> fx_fire_bld_m, else fx_fire_bld_l.',
    'place': 'Fire anchor = building anchor + [0, -0.55 * topPx] (base of the flames at about eave height so the '
             'crown engulfs the roof); scale = clamp(0.85 * fw / baseWidthPx, 0.7, 1.3); depth = building depth + 1.',
    'grow': 'Start: one fx_fire_window (alpha tween in) + fx_smoke_column at scale 0.5. Full fire: fx_fire_bld_* + '
            '1-2 fx_fire_window + fx_smoke_column (scale 1) + fx_embers. Dying: lower the fire alpha / scale to 0.6, '
            'spawn fx_steam_puff more often, tint the smoke lighter (0xdfe4ec) -> swap the building for the civic '
            'ruin_* sprite and keep a small smoke column (scale 0.45) + fx_embers (alpha 0.5) for a while.',
    'alarm': 'fx_alarm_flash on the fire_alarm_post (or above the building, anchor + [0, -topPx - 30]) until the '
             'fire truck arrives; fx_siren_glow_red at the truck sirenPoint.',
}

FIGHT_GUIDE = {
    'play': 'Scuffle: walk the two residents together, hide both, play fx_fight_cloud at their midpoint (ground) for '
            '2-4 s, then fx_poof (assets/fx) and show them again apart, dizzy / sulking (emotes). A police officer '
            'arrives (police car with fx_siren_glow_red + fx_siren_glow_blue). Nobody gets hurt.',
    'curious': 'Story network: fx_question_mark over a resident asking about something new, fx_lightbulb_idea when '
               'they learn it / get an idea, fx_memory_sparkle while recalling a memory or hearing a rumour.',
}


# =========================================================================== rendering helpers (picklable)
def _render_sheet(key):
    import gen_fx_city_fx as FXC
    d = SHEETS[key]
    fn = FXC.SHEET_FNS[key]
    frames = [fn(i, d['frames']) for i in range(d['frames'])]
    for f in frames:
        assert f.size == (d['w'], d['h']), (key, f.size)
    return key, frames


def _render_ui(key):
    import gen_ui4 as UI
    for k, fn, _ in UI.ICONS:
        if k == key:
            return key, fn()
    for k, fn, *_ in UI.PANELS:
        if k == key:
            return key, fn()
    raise KeyError(key)


def grid_strip(frames, max_w=2048):
    """frames left->right, wrapped into balanced rows so the sheet is at most max_w wide (same as gen_fx)."""
    from PIL import Image
    fw, fh = frames[0].size
    n = len(frames)
    cols = max(1, min(n, max_w // fw))
    rows = (n + cols - 1) // cols
    cols = (n + rows - 1) // rows
    out = Image.new('RGBA', (cols * fw, rows * fh), (0, 0, 0, 0))
    for i, fr in enumerate(frames):
        out.alpha_composite(fr, ((i % cols) * fw, (i // cols) * fh))
    return out


def render_all(sheet_keys, ui_keys, jobs=2):
    sheets, ui = {}, {}
    t0 = time.time()
    if jobs > 1:
        with ProcessPoolExecutor(max_workers=jobs) as ex:
            order = sorted(sheet_keys, key=lambda k: -SHEETS[k]['w'] * SHEETS[k]['h'] * SHEETS[k]['frames'])
            fs = [ex.submit(_render_sheet, k) for k in order] + [ex.submit(_render_ui, k) for k in ui_keys]
            for f in fs:
                k, v = f.result()
                (sheets if k in SHEETS else ui)[k] = v
                print('  rendered %-22s %6.1fs' % (k, time.time() - t0), flush=True)
    else:
        for k in sheet_keys:
            sheets[k] = _render_sheet(k)[1]
            print('  rendered %-22s %6.1fs' % (k, time.time() - t0), flush=True)
        for k in ui_keys:
            ui[k] = _render_ui(k)[1]
    return {k: sheets[k] for k in sheet_keys}, {k: ui[k] for k in ui_keys}


# =========================================================================== manifest
def manifest(sheets, icons, panels):
    import gen_ui4 as UI
    man = {
        'version': 1,
        'generator': 'tools/fx/gen_fx_city.py (+ gen_fx_city_fx.py, gen_ui4.py)',
        'conventions': {
            'contract': 'CONTRACT_V8 §AC. Paths relative to frost-village/assets/. Fragment name: fx_city (add it to '
                        'FRAGMENTS in src/core/Assets.js).',
            'blend': 'Every sheet is NORMAL-blend artwork (saturated cores + darker warm / cool rims) so it reads on '
                     'white snow, where ADD vanishes (handoff doc 04 §2.5). Fire / glows also look fine with ADD at '
                     'night or over dark ground.',
            'sheets': 'Frames left->right, wrapped into balanced rows so no sheet is wider than 2048 px (Phaser reads '
                      'the grid row-major). Phaser anim key = sheet key (Assets.sheetAnims). Loops are seamless '
                      '(every motion periodic over the frame count); one-shots show the effect from frame 0 and '
                      'fade out on the last frames.',
            'tone': 'Cute and family-friendly: comic dust-cloud scuffles (stars, no injuries), nobody is ever hurt in '
                    'a fire, demolition is soft dust and planks.',
            'icons': 'ui4_icons: 96x96 soft-toy icons (house style of assets/ui, ui2, ui3), anchor [0.5, 0.5], trimmed '
                     'atlas with sourceSize kept; they read at 32 px on cream and dark. No text baked anywhere.',
            'panels': 'Panels are plain images (not atlas frames) so Phaser NineSlice can use them; margins in '
                      'nineSlice, layout boxes in sprites[key] (contentInset = [left, top, right, bottom] px from the '
                      'stretched edges; *Box = [x, y, w, h] in source px).',
        },
        'hoseAim': HOSE_AIM,
        'fireMount': FIRE_MOUNT,
        'fightGuide': FIGHT_GUIDE,
        'atlases': [{'key': ATLAS, 'png': 'fx_city/%s.png' % ATLAS, 'json': 'fx_city/%s.json' % ATLAS}],
        'images': [{'key': k, 'png': 'fx_city/%s.png' % k} for k in panels],
        'spritesheets': [],
        'sprites': {},
        'nineSlice': {},
    }
    for k in sheets:
        d = SHEETS[k]
        e = {'key': k, 'png': 'fx_city/%s.png' % k, 'frameWidth': d['w'], 'frameHeight': d['h'],
             'frameCount': d['frames'], 'fps': d['fps'], 'repeat': d['repeat'], 'anchor': d['anchor'],
             'blend': 'NORMAL', 'notes': d['notes']}
        for extra in ('baseWidthPx', 'heightPx', 'plot', 'pair'):
            if extra in d:
                e[extra] = d[extra]
        man['spritesheets'].append(e)
    notes = {k: n for k, _, n in UI.ICONS}
    for k, im in icons.items():
        man['sprites'][k] = {'atlas': ATLAS, 'frame': k, 'anchor': [0.5, 0.5], 'kind': 'icon',
                             'frameSize': list(im.size), 'notes': notes[k]}
    for k, fn, margins, extra, note in UI.PANELS:
        if k not in panels:
            continue
        w, h = panels[k].size
        e = {'image': k, 'anchor': [0.5, 0.5], 'kind': 'ui', 'frameSize': [w, h], 'notes': note}
        e.update(extra)
        man['sprites'][k] = e
        if margins:
            man['nineSlice'][k] = dict({'image': k}, **margins)
    return man


# =========================================================================== build
def build(only=None, gifs=True, scene=True, jobs=2):
    import fxlib as F
    import gen_ui4 as UI
    import pack_utils
    sheet_keys = [k for k in SHEETS if not only or k in only]
    icon_keys = [k for k, _, _ in UI.ICONS if not only or k in only]
    panel_keys = [k for k, *_ in UI.PANELS if not only or k in only]
    sheets, ui = render_all(sheet_keys, icon_keys + panel_keys, jobs)
    icons = {k: ui[k] for k in icon_keys}
    panels = {k: ui[k] for k in panel_keys}
    for k, im in icons.items():
        assert im.size == (96, 96), k
    import gen_fx_city_preview as PV
    if only:
        os.makedirs(CACHE, exist_ok=True)
        for k, fr in sheets.items():
            d = SHEETS[k]
            F.save_gif(fr, os.path.join(CACHE, 'fxcity_%s.gif' % k), d['fps'], hold=0 if d['repeat'] == -1 else 6,
                       anchor=d['anchor'])
        if sheets:
            PV.sheet_preview(sheets, SHEETS).convert('RGB').save(os.path.join(CACHE, 'fxcity_sheet_only.png'))
        if icons or panels:
            UI._scratch(set(icons) | set(panels))
        print('scratch ->', CACHE)
        return
    os.makedirs(OUT, exist_ok=True)
    os.makedirs(PREV, exist_ok=True)
    for k, fr in sheets.items():
        F.save_png(grid_strip(fr, 2048), os.path.join(OUT, k + '.png'), quant=256, dither=0.6)
    sheet_img, atlas = pack_utils.pack_atlas(list(icons.items()), max_width=1024, padding=2)
    F.save_png(sheet_img, os.path.join(OUT, ATLAS + '.png'))
    atlas['meta']['image'] = ATLAS + '.png'
    with open(os.path.join(OUT, ATLAS + '.json'), 'w', encoding='utf-8') as f:
        json.dump(atlas, f, separators=(',', ':'))
    for k, im in panels.items():
        F.save_png(im, os.path.join(OUT, k + '.png'))
    man = manifest(sheets, icons, panels)
    with open(os.path.join(OUT, 'manifest.json'), 'w', encoding='utf-8') as f:
        json.dump(man, f, indent=1, ensure_ascii=False)
    tot = sum(os.path.getsize(os.path.join(OUT, f)) for f in os.listdir(OUT))
    print('assets/fx_city: %d sheets, %d icons (%dx%d atlas), %d panels; payload %.1f KB' % (
        len(sheets), len(icons), sheet_img.size[0], sheet_img.size[1], len(panels), tot / 1024), flush=True)
    PV.sheet_preview(sheets, SHEETS).convert('RGB').save(os.path.join(PREV, 'fxcity_sheet.png'), optimize=True)
    PV.ui_preview(icons, panels).convert('RGB').save(os.path.join(PREV, 'fxcity_ui.png'), optimize=True)
    print('previews ->', PREV, flush=True)
    if gifs:
        for k, fr in sheets.items():
            d = SHEETS[k]
            if k == 'fx_hose_stream':                         # 5 chained copies: shows the seamless flow
                from PIL import Image
                tiled = []
                for f in fr:
                    t = Image.new('RGBA', (f.width * 5, f.height))
                    for j in range(5):
                        t.alpha_composite(f, (j * f.width, 0))
                    tiled.append(t)
                F.save_gif(tiled, os.path.join(PREV, 'fxcity_%s.gif' % k), d['fps'], scale=3, anchor=None)
                continue
            F.save_gif(fr, os.path.join(PREV, 'fxcity_%s.gif' % k), d['fps'], hold=0 if d['repeat'] == -1 else 8,
                       anchor=d['anchor'])
        PV.hose_arc_gif(sheets, os.path.join(PREV, 'fxcity_hose_arc.gif'))
        print('GIFs ->', PREV, flush=True)
    if scene:
        import gen_fx_city_scene as SC
        SC.main()


if __name__ == '__main__':
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--only', default='', help='comma separated keys -> scratch previews only')
    ap.add_argument('--no-gif', action='store_true')
    ap.add_argument('--no-scene', action='store_true')
    ap.add_argument('--jobs', type=int, default=int(os.environ.get('FV_JOBS', '2')))
    a = ap.parse_args()
    only = set(k for k in a.only.split(',') if k) or None
    build(only, gifs=not a.no_gif, scene=not a.no_scene, jobs=max(1, a.jobs))
