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
    docs/previews/fxcity_sheet.png, fxcity_ui.png, fxcity_<fx key>.gif, fxcity_hose_arc.gif, fxcity_scene.png,
    fxcity_firemount.png (every building burning per manifest.fireMount.buildings), fxcity_fight_layers.gif
Art modules also: gen_fx_city_mount.py (measures every building render -> manifest.fireMount.buildings).
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


FIRE_NOTE = ('Building fire loop: toy flame tongues rising out of an iso (2:1) ellipse lying on the roof plane - big '
             'tongues root on its back half, lower ones on its front half, and the fire melts into the roof along a '
             'curved, noisy front edge (no straight base); warm roof glow, halo, licks tearing off the top, embers. '
             'Anchor = centre of that iso base ellipse (put it on the roof). Use manifest.fireMount.buildings[key] '
             '(measured per building) or the fireMount rule; add fx_fire_glow under it, fx_smoke_column above, '
             'fx_fire_window at the window points and fx_embers.')
FIRE_GROUP = dict(lazy=True, group='fire')

SHEETS = {
    'fx_fire_bld_s': _S(240, 272, 12, 14, -1, [0.5, 211 / 272], FIRE_NOTE, baseWidthPx=196, heightPx=136,
                        plot='S: footprint <= 240 px (townhouses, small shops)', **FIRE_GROUP),
    'fx_fire_bld_m': _S(328, 360, 12, 14, -1, [0.5, 280.5 / 360], FIRE_NOTE, baseWidthPx=270, heightPx=176,
                        plot='M: footprint <= 330 px (shops, civic)', **FIRE_GROUP),
    'fx_fire_bld_l': _S(424, 432, 12, 14, -1, [0.5, 332.5 / 432], FIRE_NOTE, baseWidthPx=350, heightPx=216,
                        plot='L: footprint <= 400 px; wider buildings get several fires (fireMount.multi)',
                        **FIRE_GROUP),
    'fx_fire_glow': _S(192, 96, 12, 10, -1, [0.5, 0.5],
                       'Extra: warm flickering firelight lying on a plane (2:1 ellipse, saturated orange edge so it '
                       'reads on snow). Under each building fire (fireMount.buildings[k].glow; depth = fire depth - '
                       '0.1), on the snow in front of a burning building (scale 1.5-2.5), at a window fire, or alone '
                       'on a smouldering ruin.', **FIRE_GROUP),
    'fx_fire_window': _S(96, 144, 12, 14, -1, [0.5, 0.74],
                         'Flames curling out of the top of a glowing iso window opening (burning room inside, sooty '
                         'lintel, soot streak up the wall, licks + sparks, warm wall glow). Drawn for a LEFT-facing '
                         'wall (window edges fall to the right); setFlipX(true) for a right-facing wall. Anchor = '
                         'window centre: put it on fireMount.buildings[k].windows [dx, dy, flipX, scale].',
                         **FIRE_GROUP),
    'fx_smoke_column': _S(224, 400, 16, 10, -1, [0.32, 0.95],
                          'Tall smoke plume loop: sooty billows from a glowing source (underside lit orange by the '
                          'fire) swell, drift right with the wind and turn light grey as they rise; every puff fades '
                          'by its own age so the top breaks into ragged puffs that drift off. Anchor = base of the '
                          'column: fireMount.buildings[k].smoke [dx, dy, scale]. flipX for wind from the other side; '
                          'scale 0.5 for a starting fire or a smouldering ruin.', **FIRE_GROUP),
    'fx_embers': _S(128, 224, 16, 12, -1, [0.5, 0.96],
                    'Sparks / embers (solid warm 6-8 px cores with a dark-orange rim, short trails) spiralling up. '
                    'Anchor = bottom centre (fireMount.buildings[k].embers). Big fires and smouldering ruins.',
                    **FIRE_GROUP),
    'fx_hose_stream': _S(32, 24, 8, 30, -1, [0.0, 0.5],
                         'Fire-hose water jet SEGMENT (one 32 px bead period), seamless in x, flowing toward +x by '
                         '4 px per frame: cyan-white core, translucent edges, light rim - water, not a pipe. '
                         'Vertically symmetric, so any rotation (also leftward aims) is fine. Chain copies along '
                         'the aimed arc (manifest.hoseAim.chain, Canvas fallback) - prefer the Rope on WebGL.',
                         **FIRE_GROUP),
    'fx_hose_rope': _S(256, 24, 8, 30, -1, [0.0, 0.5],
                       'Extra: the same flowing jet, 8 bead periods long, as the texture of a Phaser Rope laid along '
                       'the aimed arc (recommended: smooth bends, one draw call; manifest.hoseAim.rope). For arcs '
                       'up to ~360 px.', **FIRE_GROUP),
    'fx_hose_rope_long': _S(512, 24, 8, 30, -1, [0.0, 0.5],
                            'Extra: 16 bead periods (512 px) rope texture for long arcs (> ~360 px) so the beads keep '
                            'their size (the Rope maps the texture once over its length).', **FIRE_GROUP),
    'fx_hose_tip': _S(96, 80, 8, 30, -1, [0.0, 0.5],
                      'Extra: end of the jet - starts at exactly the jet width, necks into blobs and fans out into '
                      'filled teardrop droplets that fall with gravity (+y). Anchor (left middle) on the end of the '
                      'jet, rotation = end tangent, setFlipY(true) when T.x < N.x (manifest.hoseAim.flip).',
                      **FIRE_GROUP),
    'fx_water_mist': _S(160, 112, 12, 14, -1, [0.5, 0.6],
                        'Where the hose hits: translucent pale-blue spray cloud, splash flicks, falling droplets, '
                        'glints. Anchor = impact point. Pair with fx_steam_puff while the fire is still burning.',
                        **FIRE_GROUP),
    'fx_steam_puff': _S(128, 192, 14, 16, 0, [0.5, 0.9],
                        'One-shot white steam billow (water meets fire): spawn every ~0.3-0.5 s near the impact '
                        'point (more often as the fire dies). Anchor = source.', **FIRE_GROUP),
    'fx_fight_cloud': _S(192, 176, 12, 14, -1, [0.5, 0.86],
                         'Cartoon scuffle of TWO residents (simple mode): a tumbling ball of snow powder with two '
                         'distinct faces peeking out every frame (A: round eyes + big brows, red parka / jeans; B: '
                         'squinty eyes under a yellow beanie, blue parka / brown trousers), their fists and boots '
                         'popping out in turn, a red bobble hat knocked off, dizzy stars, pow bursts, swooshes, '
                         'kicked-up snow. Hide the two residents while it plays (manifest.fightGuide.playSimple). '
                         'Anchor = ground under the middle.', lazy=True, group='fight'),
    'fx_fight_cloud_back': _S(224, 192, 12, 14, -1, [0.5, 0.86],
                              'Extra (layered scuffle, preferred with the cityfolk `fight` anim - CONTRACT_V8 §AD): '
                              'ground shadow, kicked-up snow and the far half of a ring of snow-powder billows. '
                              'Draw BEHIND the two residents (manifest.fightGuide.play).', lazy=True, group='fight',
                              pair='fx_fight_cloud_front'),
    'fx_fight_cloud_front': _S(224, 192, 12, 14, -1, [0.5, 0.86],
                               'Extra (layered scuffle): the near half of the billow ring with gaps (the fighters '
                               'show through), swooshes, pow bursts and dizzy stars. Draw IN FRONT of the two '
                               'residents, same position / frame as fx_fight_cloud_back.', lazy=True, group='fight',
                               pair='fx_fight_cloud_back'),
    'fx_alarm_flash': _S(128, 128, 8, 10, -1, [0.5, 0.5],
                         'Alarm loop: red lamp with "!" pulsing, red warning burst flashing (~2.5 Hz, under the 3 Hz '
                         'photosensitivity limit), ringing arcs, ripple ring. Anchor = centre. Use on '
                         'fire_alarm_post, above a building in trouble (fireMount.buildings[k].alarm), police calls.'),
    'fx_siren_glow_red': _S(128, 64, 8, 12, -1, [0.5, 0.5],
                            'Rotating beacon (red): saturated light fan sweeping on the ground plane, a pulsing light '
                            'ring with a saturated edge and a big four-point flare (16 -> 48 px) when it faces the '
                            'camera - reads on snow by day. Anchor = beacon (vehicles sirenPoint). Fire truck: red '
                            'only; police car: red + blue (blue is half a turn later - start both on the same frame).',
                            pair='fx_siren_glow_blue'),
    'fx_siren_glow_blue': _S(128, 64, 8, 12, -1, [0.5, 0.5],
                             'Rotating beacon (blue), half a turn after fx_siren_glow_red. Anchor = beacon.',
                             pair='fx_siren_glow_red'),
    'fx_demolish_dust': _S(256, 192, 16, 20, 0, [0.5, 0.78],
                           'One-shot demolition / collapse: dust ring rolls out on the ground, a cloud billows up, '
                           'planks, bricks and soot bits fly. Anchor = building footprint centre; scale x1.2-1.6 for '
                           'big plots; x0.6 for each excavator bucket hit.', lazy=True, group='demolish'),
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
    'ropeTexture': 'fx_hose_rope', 'ropeLengthPx': 256, 'ropeTextureLong': 'fx_hose_rope_long',
    'ropeLengthLongPx': 512, 'ropeLongFromPx': 360,
    'tip': 'fx_hose_tip', 'impact': ['fx_water_mist', 'fx_steam_puff'],
    'arc': 'N = nozzle (cityfolk spray_hose nozzlePoint, or the fire truck hosePoint), T = target (a fire anchor + '
           '[0, -0.3 * heightPx * scale], or a window point). dx = T.x - N.x, dy = T.y - N.y, L = |T - N|. Arc '
           'height from the HORIZONTAL distance: h = clamp(0.3 * |dx|, 8, 120), then h = min(h, max(8, (1.2 * |dx| '
           '- dy) / 4)) so the jet never overshoots and hooks back down onto a target above it (end slope <= ~50 '
           'deg). Side bow b = 0.06 * L * max(0, 1 - |dx| / (0.5 * |dy| + 1)) (near-vertical aims get a soft '
           'curve instead of a rigid pole) + 0.025 * L * sin(time * 1.7) (the hose sways a little). Curve P(s) = N + '
           '(T - N) * s + [0, -h * 4 * s * (1 - s)] + nrm * b * 4 * s * (1 - s), s = 0..1, with nrm = the unit '
           'normal [-dy, dx] / L flipped so that nrm.x >= 0. End tangent = P(1) - P(0.99).',
    'flip': 'The jet textures (fx_hose_stream / _rope / _rope_long) are vertically symmetric: no flip at any angle. '
            'fx_hose_tip carries falling droplets: tip.setFlipY(T.x < N.x) so they fall down for leftward aims too.',
    'depth': 'Rope / chain depth = max(firefighter.depth, building.depth + 1) + 0.5 (the jet draws over the fire '
             'it hits); fx_hose_tip, fx_water_mist and fx_steam_puff at rope depth + 1.',
    'chain': 'Canvas fallback: split the curve into n = ceil(length / stepPx) equal arc-length steps L (<= 32 px): '
             'at each step a sprite of fx_hose_stream with origin (0, 0.5) at the step start, rotation = curve '
             'tangent there, scaleX = (L + 1) / 32 (seamless texture, +1 px hides hairline gaps), scaleY = 1.0 -> '
             '0.7 along the arc (the jet thins). All segments play the same anim in sync. fx_hose_tip at the end '
             'point with the last rotation and scaleY 0.7, fx_water_mist at T. Re-aim every frame (~8-15 sprites).',
    'rope': 'RECOMMENDED on WebGL: tex = arcLength > ropeLongFromPx ? fx_hose_rope_long : fx_hose_rope; rope = '
            'this.add.rope(N.x, N.y, tex, 0, points) with points = P(s) - N sampled every ~12 px and '
            'rope.setFrame((frame + 1) % 8) at 30 fps; setPoints() again when re-aiming (and every frame for the '
            'sway). The texture is mapped once over the arc, so the beads stay 0.7-1.4x their size. Thin it toward '
            'the end (scaleY 1 -> 0.7 via setPoints width or a smaller rope.scaleY), then fx_hose_tip (scaleY 0.7) '
            '+ fx_water_mist at T.',
    'chainNote': 'The segment chain shows faint steps at tight bends (rotated straight segments); the Rope is '
                 'smooth - prefer it whenever the renderer is WebGL.',
    'demo': 'tools/test/fx_city_phaser.mjs aims ropes and chains in 8 directions with these exact rules; '
            'gen_fx_city_scene.hose_rope() / hose_arc() are the Python versions used by docs/previews/fxcity_scene.png '
            'and fxcity_hose_arc.gif.',
}

FIRE_MOUNT = {
    'buildings': {},          # filled by build(): gen_fx_city_mount.table()
    'buildingsFormat': 'buildings[spriteKey] = {fires: [[dx, dy, sheetKey, scale, depthOffset], ...] (back -> '
                       'front), glow: [dx, dy, scale] (fx_fire_glow, depth = building + 0.9), smoke: [dx, dy, scale] '
                       '(fx_smoke_column), embers: [dx, dy], windows: [[dx, dy, flipX, scale], ...] (fx_fire_window; '
                       'windowsGuess = no lit panes found, heuristic points), alarm: [dx, dy] (fx_alarm_flash), '
                       'fragment}. Offsets in px from the building anchor at scale 1 (multiply by the building '
                       'scale). MEASURED from each building render by tools/fx/gen_fx_city_mount.py (roof line = '
                       'median top edge, so towers / chimneys / floating shop signs do not lift the fire); preview: '
                       'docs/previews/fxcity_firemount.png.',
    'pick': 'Fallback for buildings not in the table (new fragments): fw = footprint[0]; n = ceil(fw / 400) fires; '
            'each covers fw / n: S if 0.85 * fw / n <= 225, M if <= 310, else L; scale = clamp(0.85 * (fw / n) / '
            'baseWidthPx, 0.85, 1.15).',
    'place': 'Fallback placement: roof line y_r ~ -0.8 * topPx for pitched roofs / -0.92 * topPx for flat roofs (or '
             'the eave height when known; NOT -topPx: towers and signs), fire anchor = building anchor + [x_j, y_r + '
             '0.22 * fw / n], with x_j spread along the footprintPoly long axis (step 0.78 * edge / n, y following '
             'the axis * 0.35); depth = building depth + 1 (+0.01 per fire, back to front). fx_smoke_column at the '
             'middle fire + [8 * scale, -0.62 * heightPx * scale]; windows: left wall anchor + [-0.27 * fw, -0.33 * '
             'topPx], right wall [+0.27 * fw, -0.33 * topPx] with flipX.',
    'multi': 'Wide buildings (footprint > 400 px: school, harbour halls, logistics centre) burn with n = ceil(fw / '
             '400) fires along the roof (the table already lists them) - never one giant fire.',
    'tint': 'While it burns, tint the building warm so it looks lit by its own fire: setTint flickering between '
            '0xffe2c8 and 0xffcfa6 (new value every 0.12-0.18 s); while dying fade toward 0xd9cfc8 (soot) before '
            'the swap to the ruin sprite; clearTint when rebuilt.',
    'grow': 'Start: one fx_fire_window (alpha tween in) + fx_smoke_column at scale 0.5. Full fire: the table fires + '
            'fx_fire_glow + 1-2 fx_fire_window + fx_smoke_column (scale from the table) + fx_embers. Dying: lower '
            'the fire alpha / scale to 0.6, spawn fx_steam_puff more often, tint the smoke lighter (0xdfe4ec) -> '
            'swap the building for the civic ruin_* sprite and keep fx_fire_glow (alpha 0.5) + a small smoke column '
            '(scale 0.45) + fx_embers (alpha 0.5) for a while.',
    'alarm': 'fx_alarm_flash on the fire_alarm_post (or above the building at buildings[k].alarm) until the fire '
             'truck arrives; fx_siren_glow_red at the truck sirenPoint.',
}

FIGHT_GUIDE = {
    'play': 'Scuffle (preferred, with the cityfolk `fight` anim - CONTRACT_V8 §AD "for use inside '
            'fx_fight_cloud"): walk the two residents together, stand them ~44 px apart facing each other and play '
            'their `fight` anims; at their ground midpoint play fx_fight_cloud_back (depth = min(resident depths) '
            '- 0.5) and fx_fight_cloud_front (depth = max(resident depths) + 0.5) on the same frame for 2-4 s, then '
            'fx_poof (assets/fx) and part them, dizzy / sulking (emotes). A police officer arrives (police car with '
            'fx_siren_glow_red + fx_siren_glow_blue). Nobody gets hurt.',
    'playSimple': 'Simple mode (far zoom / LOD / no cityfolk yet): hide both residents and play fx_fight_cloud at '
                  'their midpoint (ground) instead - it already shows the two fighters (faces, fists, boots in two '
                  'consistent outfits).',
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
    if key.startswith('fx_fire_bld_'):
        assert abs(d['anchor'][1] * d['h'] - FXC.fire_base_y(key[-1])) < 0.5, key
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
def manifest(sheets, icons, panels, mount_table=None):
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
            'lazy': 'Texture memory: sheets with lazy: true are big and only needed during an incident - load their '
                    'group on demand (group "fire" when the first fire starts, "fight" on the first scuffle, '
                    '"demolish" before a demolition) and textures.remove() them a while after the last incident. '
                    'GPU memory per group is listed in docs/build_reports/fx_city.md (fire ~29 MB, fight ~6 MB, '
                    'demolish 3 MB; always-loaded core ~3.5 MB).',
            'icons': 'ui4_icons: 96x96 soft-toy icons (house style of assets/ui, ui2, ui3), anchor [0.5, 0.5], trimmed '
                     'atlas with sourceSize kept; they read at 32 px on cream and dark. No text baked anywhere.',
            'panels': 'Panels are plain images (not atlas frames) so Phaser NineSlice can use them; margins in '
                      'nineSlice, layout boxes in sprites[key] (contentInset = [left, top, right, bottom] px from the '
                      'stretched edges; *Box = [x, y, w, h] in source px).',
        },
        'hoseAim': HOSE_AIM,
        'fireMount': dict(FIRE_MOUNT, buildings=mount_table or {}),
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
        for extra in ('baseWidthPx', 'heightPx', 'plot', 'pair', 'lazy', 'group'):
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
    import gen_fx_city_preview as PV0
    PV0.ensure_fonts()
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
    import gen_fx_city_mount as MT
    mtab = MT.table()
    man = manifest(sheets, icons, panels, mtab)
    with open(os.path.join(OUT, 'manifest.json'), 'w', encoding='utf-8') as f:
        json.dump(man, f, indent=1, ensure_ascii=False)
    tot = sum(os.path.getsize(os.path.join(OUT, f)) for f in os.listdir(OUT))
    print('assets/fx_city: %d sheets, %d icons (%dx%d atlas), %d panels; payload %.1f KB' % (
        len(sheets), len(icons), sheet_img.size[0], sheet_img.size[1], len(panels), tot / 1024), flush=True)
    PV.sheet_preview(sheets, SHEETS).convert('RGB').save(os.path.join(PREV, 'fxcity_sheet.png'), optimize=True)
    PV.ui_preview(icons, panels).convert('RGB').save(os.path.join(PREV, 'fxcity_ui.png'), optimize=True)
    MT.preview(mtab)
    print('previews ->', PREV, flush=True)
    if gifs:
        for k, fr in sheets.items():
            d = SHEETS[k]
            if k == 'fx_hose_rope_long':
                continue                                      # same pattern as fx_hose_rope (its GIF shows it)
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
        if 'fx_hose_stream' in sheets:
            PV.hose_arc_gif(sheets, os.path.join(PREV, 'fxcity_hose_arc.gif'))
        PV.fight_layers_gif(os.path.join(PREV, 'fxcity_fight_layers.gif'))
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
