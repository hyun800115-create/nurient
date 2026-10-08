"""
bbld_assets2.py - the rest of the beachfront set of "햇살 해변" (docs/CONTRACT_V7.md §X): pension, beach_bar, seafood_bbq,
souvenir_shop, swimwear_shop, surf_shop, convenience_store, lifeguard_station, tourist_info, restroom_shower,
mini_aquarium, beach_arcade, beach_gate, beach_lamp, string_lights_x / _y (+ _x variants of beach_bar,
convenience_store, beach_gate).  Registered into bbld_assets.BBLD; same conventions (see that module).
"""
import math

import bpy  # noqa: F401
from mathutils import Vector

import prop_lib as L
from prop_lib import flat, tonal, box, cyl, sphere, blob, extrude, hexmix
import prop_assets as PA
import bld_assets as BA
import town_lib as T
import harbor_lib as H
import bbld_lib as B
from bld_assets import mark
from bbld_assets import (bbld, variant_x, side_faces, wface, on_face, out_dir, along_sign, wall_open, bistro_chair,
                         table_parasol)


def emblem_disc(name, center, emblem, r=0.5, bg=B.WHITE, rim=B.TURQ, es=0.9, legs=0.0, tilt=6.0):
    """Camera-facing round sign (psi-corrected for _x variants), optionally on two little legs (legs = leg length)."""
    if legs:
        a = math.radians(B.psi())
        for s in (-1, 1):
            cyl(name + '_leg', 0.035, legs, (center[0] + s * r * 0.55 * math.cos(a), center[1] + s * r * 0.55 *
                                            math.sin(a), center[2] - r - legs + 0.08), mat=flat('#9AA3AE', 0.4, 0.5),
                segs=8)
    return T.sign_disc(name, center, r=r, bg=bg, rim=rim, emblem=emblem, es=es, psi=B.psi(), tilt=tilt, snow=False)


def mark_light_window(loc, size=0.8):
    B.light_pt(loc, 'window', size)


# =========================================================================== PENSION

PENSION_NOTE = ('Pension / guesthouse "바다 민박" (3.8 x 3.4 m): two-storey lemon-yellow cottage with white trims, a '
                'terracotta gable roof, sky-blue shutters, a pergola porch draped in pink bougainvillea, a wooden '
                'balcony with beach towels on a line, a swim ring on the wall, a bicycle, a little front garden with a '
                'white picket fence and a house-and-heart sign.  staffPoints = the owner at the gate; customerPoints = '
                'family guests arriving; balconyPoints (draw at d + 0.5, pension_front = railing at d + 1).')


@bbld('pension', 'building', 'bbld_shops', fp=(3.8, 3.4), notes=PENSION_NOTE, ko='바다 민박', en='Seaside pension',
      zone='lodging')
def b_pension():
    BX, BY, W, D = -0.25, 0.65, 2.7, 2.1
    PL, ST = 0.2, 1.4
    Hh = PL + 2 * ST
    x0, x1, y0, y1 = B.shell('walls', BX, BY, W, D, PL, Hh, '#FBE9B4', plinth='#D8CBB6', trim=B.STUCCO_W)
    T.band('band', W, D, PL + ST - 0.05, B.STUCCO_W, h=0.09, x=BX, y=BY)
    ridge = Hh + 1.15
    T.gable('roof', W, D, Hh, ridge, 0.3, B.TERRA, B.stucco('#FBE9B4'), x=BX, y=BY, snow_frac=(0, 0))
    _, smoke = T.chimney('chim', x0 + 0.45, BY + 0.5, Hh - 0.2, ridge + 0.15, col='#C77B5A')
    sh = '#7FB8E0'
    # ground floor: window (left) + door with pergola (right)
    B.gwin('gw1', (BX - 0.6, y0, PL + 0.5), 'y-', w=0.55, h=0.62, shutters=sh, curtain=B.PINK)
    box('fbox', (0.75, 0.18, 0.14), (BX - 0.6, y0 - 0.08, PL + 0.32), mat=flat(sh, 0.6), bevel=0.02)
    for k in range(6):
        sphere('ffl', 0.06, (BX - 0.9 + 0.12 * k, y0 - 0.14, PL + 0.5), flat((B.PINK, B.CORAL, B.LEMON)[k % 3], 0.5),
               segs=8, rings=6)
    dx = BX + 0.6
    T.door('door', (dx, y0, PL), 'y-', w=0.66, h=1.32, col=sh, frame_col=B.STUCCO_W, glass=True, step_col='#D8CBB6')
    # pergola over the door with bougainvillea
    wm = tonal(B.WOOD, 0.06, 4.0)
    for s in (-1, 1):
        cyl('pgpost', 0.05, 1.95, (dx + s * 0.55, y0 - 0.85, 0.0), mat=wm, segs=8)
    for k in range(5):
        box('pgslat', (0.06, 1.0, 0.07), (dx - 0.5 + 0.25 * k, y0 - 0.45, 1.95), mat=wm, bevel=0.01)
    box('pgbeam', (1.3, 0.08, 0.1), (dx, y0 - 0.85, 1.9), mat=wm, bevel=0.01)
    rnd = L.rng(31)
    for k in range(26):
        t = rnd.random()
        p = (dx - 0.6 + 1.2 * t, y0 - 0.15 - rnd.random() * 0.75, 1.98 + rnd.uniform(-0.02, 0.08))
        sphere('bvf', rnd.uniform(0.07, 0.11), p, flat((B.PINK, '#E8589A', B.LEAF)[k % 3], 0.6), segs=8, rings=6)
    for k in range(6):
        sphere('bvh', 0.08, (dx + 0.55 - 0.02 * k, y0 - 0.85 + rnd.uniform(-0.05, 0.05), 1.85 - 0.25 * k),
               flat(('#E8589A', B.LEAF)[k % 2], 0.6), segs=8, rings=6)
    # upper floor: balcony across the front with towels on a line
    bz = PL + ST
    g, stand = B.balcony('bal', (BX, y0, bz + 0.02), 'y-', w=2.3, depth=0.55, rail='#C9A070', rail_top='#9C7048',
                         floor='#C9A070', items=['plant', 'chair:%s' % B.CORAL], seed=3)
    for k, xx in enumerate((-0.55, 0.55)):
        B.gwin('uw%d' % k, (BX + xx, y0, bz + 0.08), 'y-', w=0.46, h=0.9, sill=None, shutters=sh,
               curtain=(B.MINT, B.LEMON)[k])
    for s in (-1, 1):
        cyl('lnp', 0.02, 0.9, (BX + s * 1.1, y0 - 0.5, bz + 0.55), mat=wm, segs=6)
    L.smooth_tube('line', [(BX - 1.1, y0 - 0.5, bz + 1.42), (BX, y0 - 0.5, bz + 1.34), (BX + 1.1, y0 - 0.5,
                                                                                        bz + 1.42)],
                  0.008, flat(B.WHITE, 0.6))
    for k, (xx, c) in enumerate(((-0.6, B.CORAL), (-0.1, B.TURQ), (0.45, B.LEMON))):
        box('ltw%d' % k, (0.32, 0.025, 0.5), (BX + xx, y0 - 0.5, bz + 0.86), mat=L.stripes(c, B.WHITE, 1.0 / 0.08, 'X',
                                                                                            soft=0.02), bevel=0.01)
    B.front([o for o in bpy.data.objects if o.name.startswith('ltw')])
    # visible side: windows, swim ring, bicycle
    B.gwin('sw1', (x1, BY - 0.2, PL + 0.5), 'x+', w=0.5, h=0.6, shutters=sh, curtain=B.MINT)
    B.gwin('sw2', (x1, BY - 0.2, bz + 0.45), 'x+', w=0.5, h=0.6, shutters=sh, curtain=B.PINK)
    T.win('gwr', (x1, BY + 0.55, Hh + 0.75), 'x+', w=0.35, round_=True, seed=4)
    H.torus('ring', 0.2, 0.07, (x1 + 0.08, BY + 0.6, PL + 1.0), rot=(90, 0, 90), mats=[flat(B.CORAL, 0.45),
                                                                                   flat(B.WHITE, 0.5)],
            seg_fn=lambda j: (j // 4) % 2, M=28, K=10)
    bk = flat('#3D8BE0', 0.4, 0.3)
    mb = L.MB()
    bxp, byp = x1 + 0.25, BY + 0.05
    for s in (-1, 1):
        T.ring_seg(mb, (bxp, byp + s * 0.38, 0.3), 0.27, 0.025, flat(B.INK, 0.6), axis='x', n=16)
    mb.seg((bxp, byp - 0.38, 0.3), (bxp, byp - 0.05, 0.62), 0.025, bk)
    mb.seg((bxp, byp - 0.05, 0.62), (bxp, byp + 0.38, 0.3), 0.025, bk)
    mb.seg((bxp, byp - 0.05, 0.62), (bxp, byp - 0.12, 0.3), 0.025, bk)
    mb.seg((bxp, byp - 0.12, 0.3), (bxp, byp + 0.38, 0.3), 0.025, bk)
    mb.seg((bxp, byp - 0.38, 0.3), (bxp, byp - 0.3, 0.82), 0.022, bk)
    mb.seg((bxp - 0.18, byp - 0.3, 0.84), (bxp + 0.18, byp - 0.3, 0.84), 0.02, flat(B.INK, 0.6))
    mb.cube((0.12, 0.25, 0.05), flat('#7A4A2A', 0.6), loc=(bxp, byp + 0.0, 0.7))
    mb.done('bike', rot=(0, 0, 0))
    box('basket', (0.24, 0.2, 0.15), (bxp, byp - 0.42, 0.72), mat=tonal('#D9B26A', 0.06, 6.0), bevel=0.02)
    # front garden: picket fence with a gate gap, flowers, sign post
    T.picket_fence('fen1', (x0 - 0.05, y0 - 1.35, 0.0), (dx - 0.5, y0 - 1.35, 0.0), h=0.55, col=B.STUCCO_W, snow=False)
    T.picket_fence('fen2', (dx + 0.5, y0 - 1.35, 0.0), (x1 + 0.1, y0 - 1.35, 0.0), h=0.55, col=B.STUCCO_W, snow=False)
    for k in range(5):
        B.pot_plant('gfl%d' % k, (x0 + 0.2 + 0.3 * k, y0 - 1.05, 0.0), r=0.11, kind='flowers', seed=k)
    T.post_sign('psign', (x0 - 0.35, y0 - 1.2, 0.0), h=1.6, post_col='#9C7048', r=0.36, bg=B.STUCCO_W, rim=sh,
                emblem=lambda s: B.em_house(s), es=0.8, psi=B.psi())
    T.lamp_wall('lamp', (dx - 0.48, y0, PL + 1.15), 'y-', strength=2.0)
    # markers
    mark('door', (dx, y0 - 0.65, 0.0), facing=(0, 1, 0))
    mark('staff', (dx + 0.15, y0 - 1.15, 0.0), facing=(-0.2, -1, 0))
    for k in range(3):
        mark('customer', (dx - 0.05 * k, y0 - 1.75 - 0.42 * k, 0.0), facing=(0, 1, 0))
    p = B.face_to_local('y-', (BX, y0, bz + 0.02), (stand[0] - 0.3, stand[1], 0.0))
    mark('balcony', p, facing=(0, -1, 0))
    p = B.face_to_local('y-', (BX, y0, bz + 0.02), (stand[0] + 0.55, stand[1], 0.0))
    mark('balcony', p, facing=(0, -1, 0))
    mark('in', (x1 + 0.7, y0 - 0.55, 0.0))
    B.light_pt((dx - 0.48, y0 - 0.25, PL + 1.1), 'lamp', 0.7)
    return {'fx': {'smoke': smoke, 'sign': (x0 - 0.35, y0 - 1.2, 1.6)}}


# =========================================================================== BEACH BAR

BAR_NOTE = ('Beach bar "코코넛 바" (3.8 x 3.4 m): open-air palapa on palm-trunk posts under a shaggy thatched roof with a '
            'coconut-cocktail sign on top, a bamboo-fronted bar counter with four stools (seatPoints, facing the '
            'bar), the bartender BEHIND the counter (staffPoints[0], draw beach_bar_front above him), a back bar '
            'of colourful bottles and coconuts, tiki torches, party bulbs along the eaves, a surfboard and a menu '
            'board.  customerPoints = standing guests at the counter end.')


def thatch_fringe(name, x0, x1, y0, y1, z, n_per_m=9, h=0.22, col=B.THATCH, seed=0):
    """Shaggy fringe hanging below the thatch eaves along the 4 edges."""
    rnd = L.rng(seed)
    m1 = flat(hexmix(col, '#000000', 0.12), 0.9)
    m2 = flat(col, 0.9)
    mb = L.MB()
    edges = [((x0, y0), (x1, y0)), ((x1, y0), (x1, y1)), ((x1, y1), (x0, y1)), ((x0, y1), (x0, y0))]
    for (ax, ay), (bx, by) in edges:
        ln = math.hypot(bx - ax, by - ay)
        n = int(ln * n_per_m)
        for k in range(n):
            t = (k + 0.5) / n
            x, y = ax + (bx - ax) * t, ay + (by - ay) * t
            hh = h * rnd.uniform(0.75, 1.2)
            mb.cone(0.07, 0.015, hh, m1 if k % 2 else m2, loc=(x, y, z - hh / 2), segs=4)
    return mb.done(name, smooth=False)


def bar_builder():
    side = side_faces()
    sgn = 1.0 if side == 'x+' else -1.0
    X0, X1, Y0, Y1 = -1.6, 1.6, -1.25, 1.3
    B.plank_floor('deck', X0, X1, Y0, Y1, z=0.05, t=0.08, along='x', seed=2)
    B.deck_skirt('skirt', X0, X1, Y0, Y1, h=0.08)
    trunk = L.stripes('#A8794E', '#8C6240', 8.0, 'Z', rough=0.85, soft=0.15)
    for px_ in (X0 + 0.15, X1 - 0.15):
        for py_ in (Y0 + 0.15, Y1 - 0.15):
            cyl('post', 0.09, 2.5, (px_, py_, 0.0), mat=trunk, segs=12, r_top=0.08)
    RZ = 2.45
    roof, roof_z = B.hip_roof('thatch', X0 + 0.1, X1 - 0.1, Y0 + 0.1, Y1 - 0.1, RZ, 0.9, over=0.22, col=B.THATCH,
                              fascia=B.THATCH, t=0.18, ridge_col='#B98C48')
    roof[0].data.materials[0] = B.thatch_mat()
    thatch_fringe('fringe', X0 - 0.12, X1 + 0.12, Y0 - 0.12, Y1 + 0.12, RZ - 0.02, h=0.18, seed=4)
    # sign: coconut cocktail on top of the roof
    emblem_disc('rsign', (0.0, 0.05, RZ + 1.62), lambda s: B.em_cocktail(s), r=0.5, bg=B.LEMON, rim=B.CORAL, es=0.95,
                legs=0.4)
    # bar counter (front) - bamboo front, dark top
    cy = -0.42
    bam = L.stripes('#D9B870', '#B8944E', 1.0 / 0.08, 'X', rough=0.75, soft=0.2)
    box('counter', (2.4, 0.42, 1.0), (0.0, cy, 0.05), mat=bam, bevel=0.03)
    box('ctop', (2.55, 0.55, 0.07), (0.0, cy - 0.02, 1.05), mat=tonal('#7A4A2A', 0.06, 4.0), bevel=0.02)
    for k in range(3):
        box('cband', (2.42, 0.44, 0.04), (0.0, cy, 0.25 + 0.3 * k), mat=flat('#9C7048', 0.7), bevel=0.01)
    for k, (cx_, c) in enumerate(((-0.75, B.CORAL), (-0.1, B.LEMON), (0.6, B.MINT))):
        with L.Collect() as dc:
            B.em_cocktail(0.2, drink=c)
        L.group(BA.top_level(dc.objs), 'cdrink%d' % k, loc=(cx_, cy - 0.12, 1.16))
    # stools in front
    seats = []
    for k in range(4):
        sx = -0.9 + 0.6 * k
        cyl('stool', 0.035, 0.36, (sx, cy - 0.62, 0.05), mat=flat('#E9E4DA', 0.4), segs=8)
        cyl('stoolt', 0.17, 0.06, (sx, cy - 0.62, 0.39), mat=flat((B.CORAL, B.TURQ, B.LEMON, B.PINK)[k], 0.5),
            segs=16, bevel=0.02)
        cyl('stoolf', 0.13, 0.03, (sx, cy - 0.62, 0.05), mat=flat('#E9E4DA', 0.4), segs=12)
        seats.append((sx, cy - 0.62))
    # back bar: shelves with bottles + coconuts, a small fridge
    bb = 0.95
    box('bback', (2.4, 0.3, 1.6), (0.0, bb, 0.05), mat=tonal(B.WOOD_D, 0.06, 4.0), bevel=0.02)
    for j in range(2):
        box('bshelf', (2.3, 0.32, 0.04), (0.0, bb - 0.05, 0.85 + 0.42 * j), mat=tonal(B.WOOD, 0.06, 4.0), bevel=0.01)
        for k in range(9):
            c = (B.CORAL, '#5FA97A', B.LEMON, '#7FB8E0', '#C98A5A', B.PINK, '#F4F1EA', B.LILAC, B.TURQ)[(k + j * 3) % 9]
            cyl('bottle', 0.045, 0.24, (-1.0 + 0.25 * k, bb - 0.1, 0.89 + 0.42 * j), mat=flat(c, 0.15), segs=10,
                r_top=0.02, bevel=0.01)
    for k in range(3):
        sphere('coco', 0.11, (-0.85 + 0.2 * k, bb - 0.12, 0.62), flat('#7A5232', 0.7), segs=12, rings=8)
    box('fridge', (0.55, 0.4, 0.85), (0.75, bb - 0.2, 0.05), mat=flat('#E9F1F4', 0.3), bevel=0.04)
    box('fridgeg', (0.45, 0.02, 0.6), (0.75, bb - 0.41, 0.15), mat=B.glass_mat('frg', '#DFF4FA', '#9FD6E6', strength=1.6),
        bevel=0.01)
    # tiki torches at the front corners (flames are static + glowing)
    fm = L.flame_mat('tikif', strength=1.4)
    B.night(fm, '#FFB050', 3.0)
    for k, tx in enumerate((X0 - 0.25, X1 + 0.25)):
        cyl('tiki', 0.035, 1.6, (tx, Y0 - 0.25, 0.0), mat=L.stripes('#A8794E', '#8C6240', 10.0, 'Z', soft=0.2),
            segs=8)
        cyl('tikic', 0.08, 0.2, (tx, Y0 - 0.25, 1.55), mat=tonal('#8C6240', 0.08, 6.0), segs=10, r_top=0.1)
        f = L.flame('tikifl%d' % k, 0.07, 0.24, (tx, Y0 - 0.25, 1.74), fm, lean=0.1)
        f.visible_shadow = False
        B.light_pt((tx, Y0 - 0.25, 1.85), 'torch', 0.9)
    # bulbs along the front eave
    B.bulb_string('bulbs', (X0 - 0.3, Y0 - 0.32, RZ - 0.2), (X1 + 0.3, Y0 - 0.32, RZ - 0.2), n=10, sag=0.15)
    # surfboard + menu board on the visible side
    sxp = X1 + 0.35 if sgn > 0 else X0 - 0.35
    with L.Collect() as sb:
        B.em_surfboard(1.9, col=B.TURQ, stripe=B.LEMON)
    L.group(BA.top_level(sb.objs), 'surf', loc=(sxp, 0.6, 0.8), rot=(8, 0, 90 * sgn))
    for s in (-1, 1):
        box('menu', (0.04, 0.42, 0.7), (sxp + s * 0.08, -0.35, 0.0), rot=(0, -s * 12, 0), mat=flat('#2F3B36', 0.8),
            bevel=0.015)
    box('menuf', (0.18, 0.48, 0.05), (sxp, -0.35, 0.66), mat=tonal(B.WOOD, 0.06, 4.0), bevel=0.015)
    B.planter_palm('bpalm', (-sxp, 1.45, 0.0), h=1.6, s=0.66, seed=9)
    # markers
    mark('staff', (0.15, 0.25, 0.05), facing=(0, -1, 0))
    for (sx, sy) in seats:
        mark('seat', (sx, sy, 0.0), facing=(0, 1, 0))
    for k in range(2):
        mark('customer', (sgn * (1.45 + 0.1 * k), -0.55 - 0.45 * k, 0.0), facing=(-sgn, 0.4, 0))
    mark('in', (-sxp, -1.75, 0.0))
    B.light_pt((0.0, Y0 - 0.32, RZ - 0.4), 'string', 1.8)
    B.light_pt((0.0, bb - 0.2, 1.3), 'window', 1.0)
    return {'fx': {'sign': (0.0, 0.05, RZ + 1.62), 'torchL': (X0 - 0.25, Y0 - 0.25, 1.85),
                   'torchR': (X1 + 0.25, Y0 - 0.25, 1.85)}, 'overlay_plane': True}


@bbld('beach_bar', 'building', 'bbld_shops', fp=(3.8, 3.4), notes=BAR_NOTE, ko='코코넛 바', en='Beach bar',
      zone='shops')
def b_beach_bar():
    return bar_builder()


variant_x('beach_bar', bar_builder)


# =========================================================================== SEAFOOD BBQ

BBQ_NOTE = ('Seafood BBQ "조개구이" (4.0 x 3.6 m): red-roofed shack with a red-white striped awning over a long charcoal '
            'grill full of clams, scallops and fish skewers; the chef stands BEHIND the grill (staffPoints[0], draw '
            'seafood_bbq_front above him), red paper lanterns, glowing blue live tanks with shellfish and fish, '
            'little tables with stools on the side (seatPoints), vertical banners.  anims.work = 4 f: smoke puffs '
            'rise from the grill, flames flicker, the lanterns sway.  inPoint = fresh fish / shellfish delivery pad.')


@bbld('seafood_bbq', 'building', 'bbld_shops', fp=(4.0, 3.6), work=4, fps=7, notes=BBQ_NOTE, ko='조개구이',
      en='Seafood BBQ', zone='shops', anim_name='grill')
def b_seafood_bbq():
    BX, BY, W, D = -0.25, 1.05, 3.1, 1.5
    PL, WH = 0.15, 2.15
    x0, x1, y0, y1 = B.shell('walls', BX, BY, W, D, PL, PL + WH, '#F4EDE2', plinth='#CDBFA6', trim='#B23A30')
    T.gable('roof', W, D, PL + WH, PL + WH + 0.8, 0.28, '#D9483B', B.stucco('#F4EDE2'), x=BX, y=BY, snow_frac=(0, 0))
    # facade: open kitchen window + door
    T.shop_window('kwin', (BX - 0.2, y0, PL + 0.95), 'y-', w=1.5, h=0.8, frame_col='#B23A30', glow=1.3,
                  back_col='#FFE2B0', mullions=0)
    T.door('door', (x1, BY + 0.15, PL), 'x+', w=0.62, h=1.35, col='#B23A30', frame_col=B.STUCCO_W, glass=True,
           step_col='#CDBFA6', step_depth=0.25)
    # awning over the grill terrace on two posts
    AY = -0.5
    with L.Collect() as ac:
        PA.awning(W + 0.2, 0, PL + 2.0, 1.95, y0, AY, '#D9483B', B.WHITE, 12, name='awn', x=BX, flaps=True,
                  snow=False)
    for s in (-1, 1):
        cyl('apost', 0.05, 1.95, (BX + s * (W / 2 - 0.05), AY + 0.06, 0.0), mat=flat(B.STUCCO_W, 0.5), segs=10)
    # lanterns hanging from the awning front (sway in the work frames)
    lant = []
    for k, lx in enumerate((-1.1, 0.05, 1.05)):
        lm = B.neon_mat('lant%d' % k, '#E8443A', 0.5, 3.0)
        with L.Collect() as lc:
            sphere('lan%d' % k, 0.15, (0, 0, -0.42), lm, scale=(1, 1, 1.2), segs=16, rings=10)
            cyl('lantop%d' % k, 0.07, 0.05, (0, 0, -0.27), mat=flat('#2B2F3A', 0.5), segs=10)
            cyl('lanbot%d' % k, 0.07, 0.05, (0, 0, -0.62), mat=flat('#2B2F3A', 0.5), segs=10)
            cyl('lanstr%d' % k, 0.008, 0.25, (0, 0, -0.25), mat=flat('#2B2F3A', 0.5), segs=6)
        g = L.group(BA.top_level(lc.objs), 'lang%d' % k, loc=(BX + lx, AY + 0.05, 1.92))
        lant.append(g)
        B.light_pt((BX + lx, AY + 0.05, 1.5), 'lantern', 0.6)
    # the grill counter (chef behind it)
    GY = -0.8
    box('gbase', (2.3, 0.55, 0.78), (BX - 0.2, GY, 0.0), mat=L.brick('#B4593F', '#94442F', '#D9CFC2', scale=3.0,
                                                                     row_h=0.4), bevel=0.03)
    box('gtray', (2.2, 0.48, 0.1), (BX - 0.2, GY, 0.78), mat=flat('#3A3330', 0.6, 0.4), bevel=0.02)
    coal = L.emissive('coal', '#3A2A22', '#FF6A2A', 0.9)
    B.night(coal, '#FF7A30', 2.6)
    box('coals', (2.05, 0.38, 0.04), (BX - 0.2, GY, 0.86), mat=coal, bevel=0.01)
    mb = L.MB()
    gm = flat('#5A606B', 0.4, 0.7)
    for k in range(18):
        x = BX - 1.2 + 2.0 * k / 17
        mb.seg((x, GY - 0.22, 0.98), (x, GY + 0.22, 0.98), 0.01, gm)
    mb.seg((BX - 1.25, GY - 0.22, 0.98), (BX + 0.85, GY - 0.22, 0.98), 0.015, gm)
    mb.seg((BX - 1.25, GY + 0.22, 0.98), (BX + 0.85, GY + 0.22, 0.98), 0.015, gm)
    mb.done('grate')
    rnd = L.rng(8)
    for k in range(9):
        x = BX - 1.1 + 0.22 * k
        y = GY + rnd.uniform(-0.12, 0.12)
        if k % 3 == 2:
            PA.fish_model('gfish%d' % k, length=0.3, height=0.12, thick=0.06, loc=(x, y, 1.02), rot=(0, 0, 70),
                          cooked=True)
        else:
            sphere('clam%d' % k, 0.075, (x, y, 1.02), flat('#F1E3C8', 0.5), scale=(1.2, 1, 0.45), segs=12, rings=8)
            sphere('clamt%d' % k, 0.07, (x - 0.02, y + 0.02, 1.07), flat('#E3C9A1', 0.5), scale=(1.2, 1, 0.35),
                   rot=(0, -40, 0), segs=12, rings=8)
    box('tongs', (0.3, 0.03, 0.03), (BX + 0.75, GY - 0.25, 0.9), rot=(0, 0, 20), mat=flat('#C9CED6', 0.3, 0.8),
        bevel=0.005)
    flames = L.Flames('gfl', [((BX - 1.0 + 0.4 * k, GY, 0.86), 0.06, 0.16 + 0.04 * (k % 2)) for k in range(5)])
    smoke = L.Smoke('gsm', (BX - 0.2, GY - 0.05, 1.1), n=3, rise=1.1, drift=(0.25, -0.3), r0=0.15, r1=0.42,
                    alpha=0.85, seed=4)
    smoke2 = L.Smoke('gsm2', (BX - 0.9, GY - 0.05, 1.05), n=3, rise=0.9, drift=(0.2, -0.25), r0=0.12, r1=0.32,
                     alpha=0.8, seed=9)
    # live tanks (right front, under the awning, glowing blue) with shellfish and fish
    TX = x1 - 0.2
    box('tankbase', (0.55, 0.9, 0.5), (TX - 0.1, -0.35, 0.0), mat=flat(B.STUCCO_W, 0.5), bevel=0.03)
    for j in range(2):
        z = 0.5 + 0.48 * j
        box('tank%d' % j, (0.5, 0.85, 0.44), (TX - 0.1, -0.35, z), mat=B.tank_glass('tankw%d' % j), bevel=0.02)
        box('tankb%d' % j, (0.04, 0.83, 0.42), (TX + 0.12, -0.35, z + 0.01),
            mat=L.emissive('tankbk%d' % j, '#6FC3EA', '#4FB0E0', 0.5), bevel=0.0)
        box('tankf%d' % j, (0.54, 0.89, 0.04), (TX - 0.1, -0.35, z + 0.44), mat=flat('#2B2F3A', 0.5), bevel=0.01)
        for k in range(3):
            sphere('tclam%d%d' % (j, k), 0.05, (TX - 0.12, -0.6 + 0.25 * k, z + 0.06), flat('#E3C9A1', 0.5),
                   scale=(1, 1.3, 0.6), segs=10, rings=6)
        PA.fish_model('tfish%d' % j, length=0.24, height=0.1, thick=0.05, loc=(TX - 0.36, -0.35 + 0.1 * j, z + 0.24),
                      rot=(90, 0, 90))
    # vertical banners on poles (left front)
    for k, c in enumerate(('#D9483B', '#F2C14E')):
        x = x0 - 0.2
        y = -1.3 + 0.55 * k
        cyl('bpole', 0.025, 2.0, (x, y, 0.0), mat=flat('#E9E4DA', 0.4), segs=8)
        box('banner', (0.03, 0.32, 0.95), (x + 0.03, y + 0.18, 0.95), mat=flat(c, 0.7), bevel=0.01)
        for j in range(3):
            box('bstripe', (0.035, 0.22, 0.06), (x + 0.03, y + 0.18, 1.15 + 0.25 * j), mat=flat(B.WHITE, 0.7),
                bevel=0.0)
    # side tables with stools (visible side)
    seats = []
    for k, ty in enumerate((-1.1, 0.2)):
        tx = x1 + 0.55
        cyl('stbl', 0.3, 0.05, (tx, ty, 0.65), mat=flat('#E9E4DA', 0.5), segs=22)
        cyl('stbll', 0.035, 0.65, (tx, ty, 0.0), mat=flat('#9AA3AE', 0.4, 0.5), segs=8)
        cyl('sgrill', 0.14, 0.08, (tx, ty, 0.7), mat=flat('#3A3330', 0.5, 0.4), segs=16)
        for j, (dx, dy) in enumerate(((0.0, -0.45), (0.0, 0.45))):
            cyl('sst', 0.13, 0.42, (tx + dx, ty + dy, 0.0), mat=flat(('#D9483B', '#3D8BE0')[j], 0.5), segs=14)
            seats.append((tx + dx, ty + dy, (0, 1, 0) if dy < 0 else (0, -1, 0)))
    emblem_disc('rsign', (BX + 0.2, BY + 0.05, PL + WH + 1.3), lambda s: B.em_shellfish_grill(s), r=0.5,
                bg='#FFF1D6', rim='#D9483B', es=0.95, legs=0.35)
    _, chim = T.chimney('chim', x1 - 0.4, BY + 0.35, PL + WH, PL + WH + 0.9, col='#8E6A5A')
    # markers
    mark('staff', (BX - 0.35, GY + 0.55, 0.0), facing=(0, -1, 0))
    for k in range(3):
        mark('customer', (BX - 0.1 + 0.1 * k, GY - 0.7 - 0.45 * k, 0.0), facing=(0, 1, 0))
    for sx, sy, f in seats:
        mark('seat', (sx, sy, 0.0), facing=f)
    mark('door', (x1 + 0.45, BY + 0.15, 0.0), facing=(-1, 0, 0))
    mark('in', (x0 - 0.3, -1.95, 0.0))
    B.light_pt((BX - 0.2, y0 - 0.2, PL + 1.3), 'window', 0.8)

    def idle():
        flames.show(False)
        smoke.show(False)
        smoke2.show(False)
        for g in lant:
            g.rotation_euler.x = 0.0

    def work(i):
        flames.set(i)
        smoke.set(i)
        smoke2.set((i + 2) % 4)
        for k, g in enumerate(lant):
            g.rotation_euler.x = math.radians(5.0 * math.sin(math.tau * (i / 4.0 + k * 0.3)))
    return {'idle': idle, 'work': work, 'overlay_plane': True,
            'fx': {'smoke': (BX - 0.2, GY, 1.3), 'grill': (BX - 0.2, GY, 1.0), 'chimney': chim}}


# =========================================================================== SOUVENIR SHOP

SOUV_NOTE = ('Souvenir shop "조개 기념품" (3.4 x 3.2 m): white shop with sea-blue trims and a blue gable roof, a big '
             'scallop-shell sign, a lit display window with a giant snow globe of the frost village, shells, starfish '
             'and a little lighthouse, a blue-white awning with a shell wind chime, a postcard spinner and a straw-hat '
             'stand outside.  staffPoints = the clerk at the door; customerPoints = browsing tourists at the racks.')


@bbld('souvenir_shop', 'building', 'bbld_shops', fp=(3.4, 3.2), notes=SOUV_NOTE, ko='조개 기념품',
      en='Souvenir shop', zone='shops')
def b_souvenir_shop():
    BX, BY, W, D = -0.15, 0.6, 2.6, 2.0
    PL, WH = 0.16, 2.15
    blue = '#3D7CC9'
    x0, x1, y0, y1 = B.shell('walls', BX, BY, W, D, PL, PL + WH, B.STUCCO, plinth='#D8CBB6', trim=blue)
    ridge = PL + WH + 1.0
    T.gable('roof', W, D, PL + WH, ridge, 0.3, blue, B.stucco(B.STUCCO), x=BX, y=BY, along='y', snow_frac=(0, 0))

    def display(objs):
        objs.append(sphere('globe', 0.24, (-0.2, -0.13, 0.4), B.glass_mat('globeg', '#EAF6FB', '#BFE2F0', strength=1.2),
                           segs=24, rings=14))
        objs.append(cyl('globeb', 0.2, 0.14, (-0.2, -0.13, 0.04), mat=flat('#7A4A2A', 0.6), segs=20, r_top=0.17))
        objs.append(blob('gsnow', 0.15, (-0.2, -0.13, 0.22), flat('#F4F7FB', 0.9), scale=(1.2, 1.2, 0.5), seed=2))
        objs.append(box('ghouse', (0.1, 0.1, 0.1), (-0.22, -0.13, 0.3), mat=flat('#C98F55', 0.6), bevel=0.01))
        objs.append(cyl('gtree', 0.05, 0.16, (-0.1, -0.13, 0.28), mat=flat('#2E6B4F', 0.7), segs=8, r_top=0.0))
        with L.Collect() as c:
            B.em_starfish(0.3)
        objs.append(L.group(BA.top_level(c.objs), 'dstar', loc=(0.3, -0.06, 0.55)))
        with L.Collect() as c2:
            B.em_shell(0.25, col=B.PINK)
        objs.append(L.group(BA.top_level(c2.objs), 'dshell', loc=(0.32, -0.06, 0.2)))
        objs.append(cyl('dlh', 0.05, 0.4, (0.1, -0.12, 0.0), mat=L.stripes(B.WHITE, B.RED, 1 / 0.08, 'Z', soft=0.02),
                        segs=12, r_top=0.035))
    T.shop_window('swin', (BX - 0.45, y0, PL + 0.55), 'y-', w=1.2, h=0.95, frame_col=blue, display=display,
                  glow=1.2, back_col='#FFF0D2', mullions=0)
    B.awning_at('awn', 'y-', (BX - 0.45, y0, PL + 1.82), 1.6, 0.6, 0.0, -0.3, blue, B.WHITE, n=8)
    T.door('door', (BX + 0.8, y0, PL), 'y-', w=0.64, h=1.38, col=B.TURQ, frame_col=B.STUCCO_W, glass=True,
           step_col='#D8CBB6', step_depth=0.25)
    # wind chime of shells under the awning
    mb = L.MB()
    for k in range(5):
        x = BX - 0.7 + 0.12 * k
        mb.seg((x, y0 - 0.55, 1.88), (x, y0 - 0.55, 1.55 - 0.05 * (k % 2)), 0.004, flat('#B9A58A', 0.6), segs=4)
        mb.sphere(0.035, flat((B.PEACH, B.WHITE, B.PINK)[k % 3], 0.4), loc=(x, y0 - 0.55, 1.53 - 0.05 * (k % 2)),
                  scale=(1, 0.5, 1.2), segs=8, rings=6)
    mb.done('chime')
    # gable front: big scallop shell sign
    T.emblem_at('gshell', lambda s: B.em_shell(s, col=B.PEACH), (BX, y0 - 0.08, PL + WH + 0.42), psi=0.0,
                scale=0.75)
    # side window (visible side)
    B.gwin('sw', (x1, BY + 0.1, PL + 0.75), 'x+', w=0.6, h=0.7, shutters=blue, curtain=B.LEMON)
    # outside: postcard spinner + straw-hat stand
    px_, py_ = BX - 0.55, y0 - 1.05
    cyl('spbase', 0.18, 0.04, (px_, py_, 0.0), mat=flat('#9AA3AE', 0.4, 0.5), segs=14)
    cyl('sppole', 0.025, 1.45, (px_, py_, 0.0), mat=flat('#9AA3AE', 0.4, 0.5), segs=8)
    for j in range(3):
        for k in range(6):
            a = math.tau * k / 6
            c = (B.SKY, B.CORAL, B.LEMON, B.MINT, B.PINK, B.TURQ)[(k + j) % 6]
            box('card', (0.16, 0.012, 0.22), (px_ + 0.11 * math.cos(a), py_ + 0.11 * math.sin(a), 0.6 + 0.27 * j),
                rot=(0, 0, math.degrees(a) + 90), mat=flat(c, 0.6), bevel=0.003)
    hx, hy = x1 + 0.35, y0 - 0.45
    cyl('hpole', 0.025, 1.5, (hx, hy, 0.0), mat=tonal(B.WOOD_D, 0.06, 4.0), segs=8)
    cyl('hbase', 0.18, 0.05, (hx, hy, 0.0), mat=tonal(B.WOOD_D, 0.06, 4.0), segs=14)
    for k in range(4):
        a = math.tau * k / 4 + 0.4
        z = 0.75 + 0.22 * k
        p = (hx + 0.2 * math.cos(a), hy + 0.2 * math.sin(a), z)
        cyl('hat', 0.2, 0.025, p, mat=tonal('#E8C77A', 0.08, 8.0), segs=20, rot=(0, 20, math.degrees(a)))
        sphere('hcrown', 0.1, (p[0], p[1], z + 0.02), tonal('#E8C77A', 0.08, 8.0), scale=(1, 1, 0.65), segs=14,
               rings=8)
        cyl('hband', 0.102, 0.03, (p[0], p[1], z + 0.02), mat=flat((B.CORAL, B.TURQ, B.PINK, B.NAVY)[k], 0.6),
            segs=14)
    B.pot_plant('spot', (x0 - 0.2, y0 - 0.2, 0.0), r=0.17, kind='agave', seed=2)
    T.lamp_wall('lamp', (BX + 0.35, y0, PL + 1.5), 'y-', strength=2.0)
    mark('door', (BX + 0.8, y0 - 0.5, 0.0), facing=(0, 1, 0))
    mark('staff', (BX + 0.3, y0 - 0.5, 0.0), facing=(-0.3, -1, 0))
    mark('customer', (px_ + 0.1, py_ - 0.5, 0.0), facing=(0, 1, 0))
    mark('customer', (hx - 0.1, hy - 0.55, 0.0), facing=(0.3, 1, 0))
    mark('customer', (BX - 0.45, y0 - 0.55, 0.0), facing=(0, 1, 0))
    mark('in', (x1 + 0.6, BY + 0.7, 0.0))
    B.light_pt((BX - 0.45, y0 - 0.15, PL + 1.0), 'window', 0.9)
    B.light_pt((BX + 0.35, y0 - 0.25, PL + 1.45), 'lamp', 0.6)
    return {'fx': {'sign': (BX, y0 - 0.1, PL + WH + 0.42), 'chime': (BX - 0.45, y0 - 0.55, 1.6)}}


# =========================================================================== SWIMWEAR SHOP

SWIM_NOTE = ('Swimwear & swim-ring shop "튜브 가게" (3.4 x 3.2 m): sky-blue shop with white trims and a flat roof crowned '
             'by a giant striped swim ring, a lit window with a swimsuit mannequin and flip-flops, a yellow-white '
             'awning, a rack of colourful swim rings and a pink flamingo float outside, beach balls in a net.  '
             'staffPoints = clerk by the ring rack; customerPoints = tourists at the window / rack.')


def flamingo(name, loc, rz=0.0, s=1.0):
    pm = flat('#F48FB1', 0.45)
    objs = [H.torus(name + '_ring', 0.32 * s, 0.12 * s, (0, 0, 0.12 * s), mats=[pm], M=28, K=12)]
    pts = [(0.3 * s, 0, 0.18 * s), (0.42 * s, 0, 0.45 * s), (0.36 * s, 0, 0.72 * s), (0.44 * s, 0, 0.86 * s)]
    objs.append(L.smooth_tube(name + '_neck', pts, 0.06 * s, pm))
    objs.append(sphere(name + '_head', 0.1 * s, (0.47 * s, 0, 0.9 * s), pm, segs=14, rings=8))
    objs.append(cyl(name + '_beak', 0.04 * s, 0.13 * s, (0.56 * s, 0, 0.88 * s), rot=(0, 110, 0), mat=flat(B.INK, 0.4),
                    segs=8, r_top=0.015 * s))
    for sy in (-1, 1):
        objs.append(sphere(name + '_eye', 0.018 * s, (0.5 * s, sy * 0.07 * s, 0.93 * s), flat(B.INK, 0.3), segs=8,
                           rings=6))
    return L.group(objs, name, loc=loc, rot=(0, 0, rz))


@bbld('swimwear_shop', 'building', 'bbld_shops', fp=(3.4, 3.2), notes=SWIM_NOTE, ko='튜브 가게',
      en='Swimwear shop', zone='shops')
def b_swimwear_shop():
    BX, BY, W, D = -0.2, 0.65, 2.6, 1.9
    PL, WH = 0.16, 2.25
    x0, x1, y0, y1 = B.shell('walls', BX, BY, W, D, PL, PL + WH, '#A6D8F0', plinth='#D8CBB6', trim=B.STUCCO_W)
    B.roof_deck('roof', W + 0.1, D + 0.1, PL + WH, x=BX, y=BY, wall=B.STUCCO_W, cap=B.LEMON)
    T.band('band', W, D, PL + WH - 0.35, B.STUCCO_W, h=0.1, x=BX, y=BY)

    def display(objs):
        sm = flat(B.CORAL, 0.6)
        objs.append(cyl('mpole', 0.02, 0.35, (-0.25, -0.12, 0.0), mat=flat('#9AA3AE', 0.4, 0.5), segs=6))
        objs.append(sphere('mtorso', 0.16, (-0.25, -0.12, 0.5), flat('#F2E3D3', 0.6), scale=(1, 0.7, 1.4), segs=16,
                           rings=10))
        objs.append(sphere('mswim', 0.165, (-0.25, -0.12, 0.47), sm, scale=(1.02, 0.72, 1.0), segs=16, rings=10))
        objs.append(sphere('mhead', 0.09, (-0.25, -0.12, 0.8), flat('#F2E3D3', 0.6), segs=12, rings=8))
        objs.append(cyl('mhat', 0.16, 0.02, (-0.25, -0.12, 0.86), mat=tonal('#E8C77A', 0.08, 8.0), segs=18))
        for k, c in enumerate((B.LEMON, B.TURQ, B.PINK)):
            objs.append(box('flip%d' % k, (0.1, 0.03, 0.22), (0.12 + 0.13 * k, -0.08, 0.02), rot=(-70, 0, 0),
                            mat=flat(c, 0.5), bevel=0.01))
        objs.append(sphere('dball', 0.12, (0.35, -0.12, 0.45), L.stripes(B.RED, B.WHITE, 1 / 0.06, 'X', soft=0.05),
                           segs=16, rings=10))
    T.shop_window('swin', (BX - 0.5, y0, PL + 0.5), 'y-', w=1.25, h=1.0, frame_col=B.STUCCO_W, display=display,
                  glow=1.2, back_col='#FFF0D2', mullions=0)
    B.awning_at('awn', 'y-', (BX - 0.5, y0, PL + 1.8), 1.65, 0.62, 0.0, -0.32, B.LEMON, B.WHITE, n=8)
    T.door('door', (BX + 0.8, y0, PL), 'y-', w=0.64, h=1.4, col=B.NAVY, frame_col=B.STUCCO_W, glass=True,
           step_col='#D8CBB6', step_depth=0.25)
    # giant striped swim ring on the roof, facing the camera
    T.emblem_at('rring', lambda s: B.em_swimring(s, c1=B.CORAL), (BX + 0.1, BY + 0.1, PL + WH + 0.62),
                psi=B.psi(), scale=2.0, tilt=6.0)
    # swim-ring rack (visible side front)
    rx, ry = x1 + 0.45, y0 - 0.1
    wm = tonal(B.WOOD_D, 0.06, 4.0)
    for s in (-1, 1):
        cyl('rpost', 0.035, 1.7, (rx, ry + s * 0.55, 0.0), mat=wm, segs=8)
    cyl('rbar', 0.03, 1.2, (rx, ry - 0.6, 1.62), rot=(-90, 0, 0), mat=wm, segs=8)
    for k, c in enumerate((B.LEMON, B.TURQ, B.PINK)):
        H.torus('rr%d' % k, 0.2, 0.075, (rx + 0.03, ry - 0.35 + 0.35 * k, 1.35), rot=(90, 0, 90),
                mats=[flat(c, 0.45), flat(B.WHITE, 0.5)], seg_fn=lambda j: (j // 4) % 2, M=28, K=10)
    flamingo('flam', (rx + 0.25, ry + 1.0, 0.0), rz=-60.0)
    # beach balls in a net bag
    for k in range(4):
        sphere('bball%d' % k, 0.14, (x0 - 0.3 + 0.12 * (k % 2), y0 - 0.45 + 0.1 * (k // 2), 0.14 + 0.2 * (k // 2)),
               L.stripes((B.RED, B.TURQ, B.LEMON, B.PINK)[k], B.WHITE, 1 / 0.07, 'X', soft=0.05), segs=16, rings=10)
    B.gwin('sw', (x1, BY + 0.45, PL + 0.85), 'x+', w=0.55, h=0.65, shutters=B.NAVY, curtain=B.LEMON)
    T.lamp_wall('lamp', (BX + 0.35, y0, PL + 1.55), 'y-', strength=2.0)
    mark('door', (BX + 0.8, y0 - 0.5, 0.0), facing=(0, 1, 0))
    mark('staff', (rx - 0.05, ry - 0.95, 0.0), facing=(-0.4, -1, 0))
    mark('customer', (BX - 0.5, y0 - 0.6, 0.0), facing=(0, 1, 0))
    mark('customer', (rx - 0.55, ry - 0.15, 0.0), facing=(1, 0, 0))
    mark('in', (x0 - 0.5, BY + 0.6, 0.0))
    B.light_pt((BX - 0.5, y0 - 0.15, PL + 1.0), 'window', 0.9)
    B.light_pt((BX + 0.35, y0 - 0.25, PL + 1.5), 'lamp', 0.6)
    return {'fx': {'sign': (BX + 0.1, BY + 0.1, PL + WH + 0.62)}}


# =========================================================================== SURF SHOP

SURF_NOTE = ('Surf shop & surf school "파도타기" (3.6 x 3.4 m): weathered driftwood shack with a teal tin roof and a big '
             'surfboard on top, a rack of colourful boards out front, wetsuits hanging on a rail, a bench, a blank '
             'surf-school board (fxPoints.boardCentre).  staffPoints = the instructor by the rack; workPoints = two '
             'students waxing boards on the sand; customerPoints = at the counter window.')


@bbld('surf_shop', 'building', 'bbld_shops', fp=(3.6, 3.4), notes=SURF_NOTE, ko='파도타기 서핑샵', en='Surf shop',
      zone='shops')
def b_surf_shop():
    BX, BY, W, D = -0.25, 0.75, 2.6, 1.8
    PL, WH = 0.12, 2.1
    planks = L.stripes('#C8B596', '#B39F80', 1.0 / 0.16, 'X', rough=0.85, soft=0.08)
    planks_y = L.stripes('#C8B596', '#B39F80', 1.0 / 0.16, 'Y', rough=0.85, soft=0.08)
    T.plinth('pl', W, D, h=PL, col='#B9A58A', x=BX, y=BY)
    x0, x1, y0, y1 = BX - W / 2, BX + W / 2, BY - D / 2, BY + D / 2
    o = box('walls', (W, D, WH), (BX, BY, PL), mat=planks, bevel=0.03)
    o.data.materials.append(planks_y)
    for p in o.data.polygons:
        if abs(p.normal.x) > 0.7:
            p.material_index = 1
    T.corner_trims('ct', W, D, PL, WH, '#8C7A5E', t=0.12, x=BX, y=BY)
    # shed roof (teal corrugated) sloping to the back
    tin = L.stripes('#2FA7A0', '#258C86', 1.0 / 0.1, 'X', rough=0.45, soft=0.2)
    zf, zb = PL + WH + 0.55, PL + WH + 0.05
    ln = math.hypot(D + 0.6, zf - zb)
    ang = math.degrees(math.atan2(zb - zf, D + 0.6))
    box('roof', (W + 0.5, ln, 0.07), (BX, BY, (zf + zb) / 2 + 0.03), rot=(ang, 0, 0), mat=tin, bevel=0.01,
        origin='center')
    box('rfront', (W, 0.12, 0.55), (BX, y0 + 0.06, PL + WH), mat=planks, bevel=0.02)
    for s in (-1, 1):
        T.ext_xz('rside%d' % (s > 0), [(-D / 2, 0.0), (D / 2, 0.0), (-D / 2, 0.5)], 0.12, planks_y).location = \
            (BX + s * (W / 2 - 0.06), BY, PL + WH)
        bpy.data.objects['rside%d' % (s > 0)].rotation_euler = (math.radians(90), 0, math.radians(90))
    # counter window + door
    T.shop_window('cwin', (BX - 0.5, y0, PL + 0.75), 'y-', w=1.1, h=0.75, frame_col='#2FA7A0', glow=1.1,
                  back_col='#FFE9C4', mullions=0)
    T.door('door', (BX + 0.75, y0, PL), 'y-', w=0.62, h=1.4, col='#F2B632', frame_col='#8C7A5E', glass=False,
           step=False)
    # big surfboard on the roof
    with L.Collect() as sb:
        B.em_surfboard(2.6, col=B.LEMON, stripe=B.CORAL)
    L.group(BA.top_level(sb.objs), 'rboard', loc=(BX + 0.2, BY + 0.2, PL + WH + 1.2), rot=(0, 0, B.psi()))
    # surf-school board (blank) on the front wall
    B.sign_board('sboard', (BX - 0.5, y0 - 0.08, PL + 1.92), w=1.05, h=0.3, bg='#FFF8EC', frame='#2FA7A0', psi_=0.0)
    # board rack in front (left) with 5 colourful boards leaning
    rx, ry = BX - 0.2, y0 - 0.95
    wm = tonal(B.WOOD_D, 0.06, 4.0)
    box('rackb', (2.0, 0.1, 0.1), (rx, ry + 0.18, 0.9), mat=wm, bevel=0.02)
    for s in (-1, 1):
        box('rackl', (0.08, 0.08, 0.95), (rx + s * 0.95, ry + 0.18, 0.0), mat=wm, bevel=0.02)
    for k, (c, st) in enumerate(((B.CORAL, B.WHITE), (B.TURQ, B.LEMON), (B.LEMON, B.CORAL), (B.PINK, B.WHITE),
                                 ('#3D8BE0', B.WHITE))):
        with L.Collect() as bc_:
            B.em_surfboard(2.2, col=c, stripe=st)
        g = L.group(BA.top_level(bc_.objs), 'board%d' % k, loc=(rx - 0.8 + 0.4 * k, ry + 0.02, 0.92),
                    rot=(-14, 0, 0))
    # wetsuits on a rail (visible side)
    sx = x1 + 0.12
    box('wrail', (0.05, 1.3, 0.05), (sx + 0.2, BY - 0.05, 1.65), mat=flat('#9AA3AE', 0.4, 0.5), bevel=0.01)
    for s in (-1, 1):
        cyl('wpost', 0.025, 1.68, (sx + 0.2, BY - 0.05 + s * 0.65, 0.0), mat=flat('#9AA3AE', 0.4, 0.5), segs=8)
    for k in range(3):
        y = BY - 0.45 + 0.4 * k
        ws = flat('#23262E', 0.5)
        box('wsuit%d' % k, (0.06, 0.34, 0.6), (sx + 0.22, y, 1.0), mat=ws, bevel=0.03)
        box('wleg%d' % k, (0.06, 0.12, 0.45), (sx + 0.22, y - 0.08, 0.56), mat=ws, bevel=0.02)
        box('wleg2%d' % k, (0.06, 0.12, 0.45), (sx + 0.22, y + 0.08, 0.56), mat=ws, bevel=0.02)
        box('wstripe%d' % k, (0.065, 0.35, 0.06), (sx + 0.22, y, 1.4), mat=flat((B.CORAL, B.TURQ, B.LEMON)[k], 0.5),
            bevel=0.01)
    T.town_bench('bench', (x0 - 0.35, BY + 0.1, 0.0), rot_z=-90.0, col='#B39F80', iron='#8C7A5E', snow=False)
    T.lamp_wall('lamp', (BX + 0.35, y0, PL + 1.55), 'y-', strength=2.0)
    mark('staff', (rx + 1.25, ry - 0.2, 0.0), facing=(-0.6, -1, 0))
    mark('customer', (BX - 0.5, y0 - 0.55, 0.0), facing=(0, 1, 0))
    mark('door', (BX + 0.75, y0 - 0.5, 0.0), facing=(0, 1, 0))
    for k in range(2):
        mark('work', (rx - 0.6 + 1.0 * k, ry - 0.85, 0.0), facing=(0.3, 1, 0))
    mark('seat', (x0 - 0.35, BY - 0.4, 0.0), facing=(-1, 0, 0))
    mark('in', (x1 + 0.7, y1 - 0.2, 0.0))
    B.light_pt((BX - 0.5, y0 - 0.15, PL + 1.15), 'window', 0.8)
    B.light_pt((BX + 0.35, y0 - 0.25, PL + 1.5), 'lamp', 0.6)
    return {'fx': {'boardCentre': (BX - 0.5, y0 - 0.12, PL + 1.92), 'sign': (BX + 0.2, BY + 0.2, PL + WH + 1.2)}}


# =========================================================================== CONVENIENCE STORE

CVS_NOTE = ('Convenience store "바닷가 편의점" (4.0 x 3.6 m): bright white box with a green-orange stripe fascia, a big '
            'lit glass front full of shelves, a basket sign, an ice-cream chest freezer and a drinks cooler by the '
            'door, packs of water, a recycling bin, and on the visible side two plastic tables with green parasols '
            '(the Korean beach-store terrace, seatPoints).  staffPoints = clerk restocking the freezer; '
            'customerPoints = at the door; inPoint = delivery (cans / bread from the village).')


def plastic_chair(name, loc, rz, col='#F4F1EA'):
    m = flat(col, 0.45)
    parts = [box(name + '_s', (0.4, 0.4, 0.05), (0, 0, 0.42), mat=m, bevel=0.03),
             box(name + '_b', (0.4, 0.05, 0.42), (0, 0.18, 0.45), rot=(-8, 0, 0), mat=m, bevel=0.03)]
    for lx in (-0.16, 0.16):
        for ly in (-0.16, 0.16):
            parts.append(cyl(name + '_l', 0.025, 0.43, (lx, ly, 0.0), mat=m, segs=6))
    return L.group(parts, name, loc=loc, rot=(0, 0, rz))


def cvs_builder():
    side = side_faces()
    sgn = 1.0 if side == 'x+' else -1.0
    BX, BY, W, D = -0.45 * sgn, 0.8, 3.0, 2.0
    PL, WH = 0.12, 2.35
    x0, x1, y0, y1 = B.shell('walls', BX, BY, W, D, PL, PL + WH, B.STUCCO_W, plinth='#C9CED6', trim=None)
    B.roof_deck('roof', W + 0.08, D + 0.08, PL + WH, x=BX, y=BY, wall=B.STUCCO_W, cap='#3FA58C', parapet=0.2)
    # stripe fascia (green / orange / white) around the top
    for k, (c, h) in enumerate((('#3FA58C', 0.16), ('#F28C38', 0.08), ('#3D7CC9', 0.06))):
        z = PL + WH - 0.4 + 0.18 * (2 - k) - (0.0 if k == 0 else 0.0)
        box('fascia%d' % k, (W + 0.06, D + 0.06, h), (BX, BY, PL + WH - 0.42 + [0.24, 0.12, 0.02][k]),
            mat=flat(c, 0.5), bevel=0.01)

    def shelves(objs):
        for j in range(3):
            objs.append(box('sh%d' % j, (2.1, 0.12, 0.03), (0, -0.1, 0.1 + 0.33 * j), mat=flat('#E9E4DA', 0.4),
                            bevel=0.005))
            for k in range(14):
                c = (B.CORAL, B.LEMON, '#5FA97A', B.SKY, B.PINK, '#F28C38', B.WHITE)[(k * 3 + j) % 7]
                hh = 0.12 + 0.06 * ((k + j) % 3)
                objs.append(box('gd', (0.11, 0.09, hh), (-1.0 + 0.15 * k, -0.1, 0.13 + 0.33 * j), mat=flat(c, 0.5),
                                bevel=0.01))
    T.shop_window('glass', (BX - 0.35 * sgn, y0, PL + 0.15), 'y-', w=2.1, h=1.55, frame_col='#C9CED6',
                  display=shelves, glow=1.35, back_col='#FFF6E6', mullions=2, depth=0.18)
    dxp = BX + 1.12 * sgn
    B.glass_door('door', (dxp, y0, PL), 'y-', w=0.62, h=1.6, frame='#C9CED6', double=False)
    emblem_disc('rsign', (BX + 0.25 * sgn, BY - 0.15, PL + WH + 0.72), lambda s: B.em_basket(s), r=0.48,
                bg=B.WHITE, rim='#3FA58C', es=0.9, legs=0.32)
    # by the door: chest freezer, drinks cooler, water packs, bin
    fx_ = dxp - 0.75 * sgn
    box('freezer', (0.85, 0.5, 0.75), (BX - 1.1 * sgn, y0 - 0.45, 0.0), mat=flat(B.WHITE, 0.4), bevel=0.04)
    box('frlid', (0.82, 0.46, 0.04), (BX - 1.1 * sgn, y0 - 0.45, 0.75),
        mat=B.glass_mat('frlid', '#E6F7FB', '#BFE6F0', strength=1.4), bevel=0.01)
    for k, c in enumerate((B.PINK, B.LEMON, B.MINT, B.CORAL, B.SKY)):
        box('icebar%d' % k, (0.12, 0.08, 0.05), (BX - 1.1 * sgn - 0.3 + 0.15 * k, y0 - 0.45, 0.7), mat=flat(c, 0.5),
            bevel=0.01)
    box('frband', (0.86, 0.51, 0.12), (BX - 1.1 * sgn, y0 - 0.45, 0.45), mat=flat('#3D7CC9', 0.5), bevel=0.02)
    cx_ = dxp + 0.62 * sgn
    box('cooler', (0.55, 0.45, 1.6), (cx_, y0 - 0.3, 0.0), mat=flat('#3FA58C', 0.5), bevel=0.04)
    box('coolg', (0.45, 0.02, 1.2), (cx_, y0 - 0.53, 0.25), mat=B.glass_mat('coolg', '#DFF4FA', '#9FD6E6',
                                                                              strength=1.6), bevel=0.01)
    for j in range(3):
        for k in range(4):
            cyl('can', 0.035, 0.12, (cx_ - 0.15 + 0.1 * k, y0 - 0.45, 0.35 + 0.38 * j),
                mat=flat((B.CORAL, B.LEMON, B.SKY, '#5FA97A')[(k + j) % 4], 0.3, 0.5), segs=10)
    for k in range(3):
        box('wpack%d' % k, (0.36, 0.26, 0.24), (dxp - 0.35 * sgn - 0.02 * k, y0 - 0.95, 0.24 * k),
            mat=flat('#BFE6F0', 0.2), bevel=0.03)
    cyl('bin', 0.17, 0.62, (x0 - 0.3 if sgn > 0 else x1 + 0.3, y0 - 0.3, 0.0), mat=flat('#3D7CC9', 0.5), segs=16,
        bevel=0.02)
    # terrace on the visible side: two plastic tables with green-white parasols
    seats = []
    tx = (x1 + 0.85) if sgn > 0 else (x0 - 0.85)
    for k, ty in enumerate((-0.75, 0.75)):
        cyl('ptbl%d' % k, 0.36, 0.04, (tx, ty, 0.7), mat=flat(B.WHITE, 0.45), segs=24)
        cyl('ptbll%d' % k, 0.04, 0.7, (tx, ty, 0.0), mat=flat(B.WHITE, 0.45), segs=8)
        cyl('ptblf%d' % k, 0.22, 0.03, (tx, ty, 0.0), mat=flat(B.WHITE, 0.45), segs=14)
        B.parasol('pps%d' % k, (tx, ty, 0.74), r=0.85, h=1.3, c1='#3FA58C', c2=B.WHITE, n=8, base=False)
        for j, (dx, dy, rz) in enumerate(((0.0, -0.5, 0), (0.0, 0.5, 180), (0.5 * sgn, 0.0, 90 * sgn))):
            plastic_chair('pc%d_%d' % (k, j), (tx + dx, ty + dy, 0.0), rz, ('#F4F1EA', '#F28C38', '#3D8BE0')[j])
            seats.append((tx + dx, ty + dy, rz))
        for j in range(2):
            cyl('pcan%d%d' % (k, j), 0.035, 0.12, (tx - 0.1 + 0.2 * j, ty, 0.74), mat=flat((B.CORAL, B.LEMON)[j], 0.3,
                                                                                         0.5), segs=10)
    T.lamp_wall('lamp', (dxp - 0.45 * sgn, y0, PL + 1.85), 'y-', strength=2.0)
    mark('door', (dxp, y0 - 0.55, 0.0), facing=(0, 1, 0))
    mark('staff', (BX - 1.1 * sgn, y0 - 0.95, 0.0), facing=(0, 1, 0))
    for k in range(2):
        mark('customer', (dxp - 0.1 * k, y0 - 1.05 - 0.45 * k, 0.0), facing=(0, 1, 0))
    for (cx, cy, rz) in seats:
        mark('seat', (cx, cy, 0.0), facing=(-math.sin(math.radians(rz)), -math.cos(math.radians(rz)), 0))
    mark('in', ((x0 - 0.75) if sgn > 0 else (x1 + 0.75), BY + 0.5, 0.0))
    B.light_pt((BX - 0.35 * sgn, y0 - 0.2, PL + 1.0), 'window', 1.3)
    B.light_pt((dxp - 0.45 * sgn, y0 - 0.25, PL + 1.8), 'lamp', 0.6)
    return {'fx': {'sign': (BX + 0.25 * sgn, BY - 0.15, PL + WH + 0.72)}}


@bbld('convenience_store', 'building', 'bbld_shops', fp=(4.0, 3.6), notes=CVS_NOTE, ko='바닷가 편의점',
      en='Convenience store', zone='shops')
def b_convenience_store():
    return cvs_builder()


variant_x('convenience_store', cvs_builder)


# =========================================================================== LIFEGUARD STATION

LG_NOTE = ('Lifeguard station "구조대" (3.8 x 3.4 m): white ground floor with red trims holding the rescue boards, a '
           'yellow look-out room on top with windows all round, a wraparound look-out deck (railing), red cross sign, '
           'loud-hailer and a red-yellow flag on the roof, an outside stair on the visible side, rescue boards and '
           'life rings.  staffPoints[0] = the lifeguard ON THE LOOK-OUT DECK (elevated: draw at d + 0.5 with '
           'lifeguard_station_front = deck railing at d + 1), staffPoints[1] = at the door below; lookoutPoint = '
           'staffPoints[0].')


@bbld('lifeguard_station', 'building', 'bbld_civic', fp=(3.8, 3.4), notes=LG_NOTE, ko='인명구조대',
      en='Lifeguard station', zone='beach_ops')
def b_lifeguard_station():
    BX, BY, W, D = -0.3, 0.7, 2.7, 2.0
    PL, GF = 0.15, 1.65
    x0, x1, y0, y1 = B.shell('walls', BX, BY, W, D, PL, PL + GF, B.STUCCO_W, plinth='#D8CBB6', trim=B.RED)
    T.band('band', W, D, PL + GF - 0.12, B.RED, h=0.14, x=BX, y=BY)
    # deck slab (look-out level) overhanging the front
    DZ = PL + GF
    box('deck', (W + 0.3, D + 0.6, 0.12), (BX, BY - 0.3, DZ), mat=tonal(B.WOOD, 0.06, 4.0), bevel=0.02)
    for s in (-1, 1):
        cyl('dpost', 0.06, DZ, (BX + s * (W / 2 + 0.05), y0 - 0.5, 0.0), mat=flat(B.STUCCO_W, 0.5), segs=10)
    # look-out room (yellow) with big windows, red flat roof
    RW, RD, RH = 1.9, 1.4, 1.35
    ry = BY + 0.2
    box('room', (RW, RD, RH), (BX, ry, DZ + 0.12), mat=B.stucco(B.LEMON), bevel=0.04)
    for k, xx in enumerate((-0.48, 0.48)):
        B.gwin('rw%d' % k, (BX + xx, ry - RD / 2, DZ + 0.55), 'y-', w=0.7, h=0.62, sill=None, frame=B.STUCCO_W,
               curtain=None)
    B.gwin('rws', (BX + RW / 2, ry, DZ + 0.55), 'x+', w=0.8, h=0.62, sill=None, frame=B.STUCCO_W, curtain=None)
    box('rroof', (RW + 0.4, RD + 0.4, 0.14), (BX, ry, DZ + 0.12 + RH), mat=flat(B.RED, 0.5), bevel=0.04)
    box('rroofb', (RW + 0.42, RD + 0.42, 0.05), (BX, ry, DZ + 0.12 + RH), mat=flat(B.STUCCO_W, 0.5), bevel=0.02)
    # loud-hailer + flag pole on the roof
    RT = DZ + 0.12 + RH + 0.14
    cyl('hpole', 0.03, 0.55, (BX - 0.5, ry, RT), mat=flat('#9AA3AE', 0.4, 0.5), segs=8)
    cyl('horn', 0.06, 0.3, (BX - 0.5, ry - 0.05, RT + 0.5), rot=(80, 0, 20), mat=flat(B.STUCCO_W, 0.4), segs=14,
        r_top=0.16)
    cyl('fpole', 0.03, 1.5, (BX + 0.6, ry + 0.2, RT), mat=flat(B.STUCCO_W, 0.4), segs=8)
    flag_m = L.stripes(B.RED, B.LEMON, 1 / 0.2, 'Z', soft=0.01)
    f = PA.flag('flag', (BX + 0.62, ry + 0.2, RT + 1.45), 0.6, 0.4, B.RED, seed=4, emblem=False)
    f.data.materials.clear()
    f.data.materials.append(flag_m)
    # deck railing (front + visible side) - front() tagged
    rails = []
    rm = flat(B.STUCCO_W, 0.5)
    yR = BY - 0.3 - (D + 0.6) / 2 + 0.05
    for k in range(13):
        x = x0 - 0.1 + (W + 0.2) * k / 12
        rails.append(cyl('rbal', 0.02, 0.55, (x, yR, DZ + 0.12), mat=rm, segs=6))
    rails.append(box('rtop', (W + 0.25, 0.06, 0.06), (BX, yR, DZ + 0.67), mat=flat(B.RED, 0.5), bevel=0.015))
    for k in range(6):
        y = y0 + 0.65 + (y1 - y0 - 0.7) * k / 5
        rails.append(cyl('rbals', 0.02, 0.55, (x1 + 0.12, y, DZ + 0.12), mat=rm, segs=6))
    rails.append(box('rtops', (0.06, y1 - y0 - 0.65, 0.06), (x1 + 0.12, (y0 + 0.65 + y1 - 0.05) / 2, DZ + 0.67),
                     mat=flat(B.RED, 0.5), bevel=0.015))
    for k in range(3):
        rails.append(cyl('rbalf', 0.02, 0.55, (x1 + 0.12, yR + 0.12 + 0.25 * k, DZ + 0.12), mat=rm, segs=6))
    rails.append(box('rtopf', (0.06, 0.6, 0.06), (x1 + 0.12, yR + 0.37, DZ + 0.67), mat=flat(B.RED, 0.5),
                     bevel=0.015))
    life = H.life_ring('dring', (BX - 0.9, yR - 0.04, DZ + 0.38), rz=0.0, R=0.18, r=0.05)
    rails.append(life)
    B.front(rails)
    # binoculars on a stand on the deck
    cyl('binst', 0.025, 0.9, (BX + 0.75, yR + 0.3, DZ + 0.12), mat=flat('#5A606B', 0.4, 0.5), segs=8)
    for s in (-1, 1):
        cyl('bino', 0.05, 0.2, (BX + 0.75 + s * 0.05, yR + 0.25, DZ + 1.08), rot=(80, 0, 0), mat=flat(B.INK, 0.4),
            segs=10, origin='center')
    # ground floor: open board store (dark opening) with boards, door, red cross sign
    box('gopen', (1.2, 0.04, 1.3), (BX - 0.55, y0 - 0.01, PL), mat=flat('#4A4F5A', 0.8), bevel=0.0)
    for k, c in enumerate((B.RED, B.LEMON, B.RED)):
        box('rboard%d' % k, (0.32, 0.06, 1.2), (BX - 0.95 + 0.38 * k, y0 - 0.08, PL + 0.05), rot=(-6, 0, 0),
            mat=L.stripes(c, B.WHITE, 1 / 0.3, 'Z', soft=0.02), bevel=0.05)
    T.door('door', (BX + 0.75, y0, PL), 'y-', w=0.62, h=1.35, col=B.RED, frame_col=B.STUCCO_W, glass=True,
           step=False)
    emblem_disc('cross', (BX + 0.2, ry - RD / 2 - 0.1, DZ + 0.12 + RH + 0.55), lambda s: B.em_lifeguard(s), r=0.42,
                bg=B.WHITE, rim=B.RED, es=0.9, legs=0.0)
    # outside stair on the visible side: runs along Y from the back (ground) up to the deck's right edge (front)
    sx_ = x1 + 0.42
    n = 9
    yb_, yt_ = y1 + 0.55, y0 + 0.15
    wd = tonal(B.WOOD, 0.06, 4.0)
    for k in range(n):
        t = (k + 1) / (n + 1)
        box('step', (0.5, 0.24, 0.05), (sx_, yb_ + (yt_ - yb_) * t, DZ * t + 0.06), mat=wd, bevel=0.01)
    for s_ in (-1, 1):
        H.beam('stringer', (sx_ + s_ * 0.27, yb_, 0.0), (sx_ + s_ * 0.27, yt_ - 0.1, DZ + 0.1), 0.06, wd)
    H.beam('spost', (sx_ + 0.27, yb_, 0.0), (sx_ + 0.27, yb_, 0.95), 0.05, flat(B.RED, 0.5))
    L.smooth_tube('srail', [(sx_ + 0.27, yb_, 0.95), (sx_ + 0.27, yt_, DZ + 0.85)], 0.025, flat(B.RED, 0.5))
    # rescue boards + life rings at ground level (left front)
    for k in range(2):
        box('gboard%d' % k, (0.06, 0.34, 1.6), (x0 - 0.2 - 0.12 * k, y0 + 0.1 + 0.35 * k, 0.0), rot=(0, -12, 0),
            mat=L.stripes((B.RED, B.LEMON)[k], B.WHITE, 1 / 0.35, 'Z', soft=0.02), bevel=0.06)
    H.life_ring('gring', (x0 - 0.02, BY + 0.5, 1.0), rz=-90.0)
    mark('staff', (BX + 0.05, yR + 0.35, DZ + 0.12), facing=(0, -1, 0))
    mark('staff', (BX + 0.75, y0 - 0.5, 0.0), facing=(0, -1, 0))
    mark('door', (BX + 0.75, y0 - 0.55, 0.0), facing=(0, 1, 0))
    mark('customer', (BX + 0.2, y0 - 1.5, 0.0), facing=(0, 1, 0))
    mark('in', (x0 - 0.7, y0 - 0.4, 0.0))
    B.light_pt((BX, ry - RD / 2 - 0.1, DZ + 0.8), 'window', 1.0)
    return {'fx': {'horn': (BX - 0.5, ry - 0.3, RT + 0.6), 'flag': (BX + 0.9, ry + 0.2, RT + 1.3)},
            'extra': {'lookoutDepth': 'front'}}


# =========================================================================== TOURIST INFO

INFO_NOTE = ('Tourist information kiosk "관광 안내소" (2.8 x 2.6 m): round white kiosk with a striped turquoise '
             'parasol-like roof and a big blue "i" sign, a service window (the guide stands INSIDE: staffPoints[0], '
             'draw tourist_info_front above), a beach map board and a brochure rack.  customerPoints = queue at the '
             'window and a spot at the map board.')


@bbld('tourist_info', 'building', 'bbld_civic', fp=(2.8, 2.6), notes=INFO_NOTE, ko='관광 안내소', en='Tourist info',
      zone='beach_ops')
def b_tourist_info():
    R, H_ = 0.95, 2.1
    cx, cy = -0.2, 0.35
    PL = 0.12
    cyl('base', R + 0.08, PL, (cx, cy, 0.0), mat=tonal('#D8CBB6', 0.04, 5.0), segs=8, bevel=0.03)
    # octagonal wall with a window opening facing the front (-Y): wall built from 7 panels + a low sill panel
    wm = B.stucco(B.STUCCO_W)
    for k in range(8):
        a = math.tau * k / 8 + math.pi / 8
        mid = a + math.tau / 16
        px_, py_ = cx + R * 0.92 * math.cos(mid), cy + R * 0.92 * math.sin(mid)
        ln = 2 * R * math.sin(math.pi / 8)
        if abs(((mid - (-math.pi / 2)) + math.pi) % math.tau - math.pi) < 0.3:
            box('sill', (ln, 0.1, 0.85), (px_, py_, PL), rot=(0, 0, math.degrees(mid) + 90), mat=wm, bevel=0.02)
            box('lintel', (ln, 0.1, 0.3), (px_, py_, PL + H_ - 0.3), rot=(0, 0, math.degrees(mid) + 90), mat=wm,
                bevel=0.02)
            box('scount', (ln + 0.1, 0.36, 0.06), (px_ + 0.12 * math.cos(mid), py_ + 0.12 * math.sin(mid), PL + 0.85),
                rot=(0, 0, math.degrees(mid) + 90), mat=flat(B.TURQ, 0.5), bevel=0.02)
        else:
            box('wall', (ln + 0.02, 0.1, H_), (px_, py_, PL), rot=(0, 0, math.degrees(mid) + 90), mat=wm, bevel=0.02)
    box('iback', (1.3, 0.05, 1.4), (cx, cy + 0.55, PL), mat=T.glow_mat('iglow', 0.8, '#FFF0D6'), bevel=0.0)
    for k in range(3):
        box('ibro', (0.3, 0.03, 0.4), (cx - 0.4 + 0.4 * k, cy + 0.5, PL + 0.95), mat=flat((B.SKY, B.CORAL, B.LEMON)[k],
                                                                                         0.6), bevel=0.01)
    cyl('band', R + 0.04, 0.12, (cx, cy, PL + H_ - 0.5), mat=flat(B.TURQ, 0.5), segs=8)
    # parasol roof
    B.cone_wedges('roof', R + 0.45, 0.85, (cx, cy, PL + H_), [flat(B.TURQ, 0.55), flat(B.WHITE, 0.55)], n=8,
                  droop=0.08)
    sphere('rball', 0.09, (cx, cy, PL + H_ + 0.9), flat(B.GOLD, 0.3, 0.8), segs=12, rings=8)
    emblem_disc('isign', (cx + 0.1, cy - 0.1, PL + H_ + 1.45), lambda s: B.em_info(s), r=0.42, bg='#3D7CC9',
                rim=B.WHITE, es=0.9, legs=0.45)
    # map board + brochure rack
    mx, my = cx + 1.05, cy - 0.85
    for s in (-1, 1):
        cyl('mleg', 0.03, 0.9, (mx + s * 0.35, my, 0.0), mat=tonal(B.WOOD_D, 0.06, 4.0), segs=8)
    box('mframe', (0.85, 0.08, 0.62), (mx, my, 0.82), mat=tonal(B.WOOD_D, 0.06, 4.0), bevel=0.02, rot=(-15, 0, 0))
    box('msea', (0.76, 0.02, 0.3), (mx, my - 0.06, 1.1), mat=flat('#5BC8D8', 0.6), bevel=0.0, rot=(-15, 0, 0))
    box('msand', (0.76, 0.02, 0.26), (mx, my - 0.03, 0.86), mat=flat('#F2E2B8', 0.6), bevel=0.0, rot=(-15, 0, 0))
    for k, (dx, dz, c) in enumerate(((-0.2, 0.95, B.RED), (0.1, 1.0, B.CORAL), (0.25, 0.92, '#3D7CC9'))):
        sphere('mdot', 0.03, (mx + dx, my - 0.09, dz), flat(c, 0.4), segs=8, rings=6)
    rx_, ry_ = cx - 1.05, cy - 0.6
    box('rack', (0.5, 0.25, 1.05), (rx_, ry_, 0.0), mat=flat(B.WHITE, 0.5), bevel=0.03)
    for j in range(3):
        for k in range(2):
            box('bro', (0.18, 0.04, 0.24), (rx_ - 0.11 + 0.22 * k, ry_ - 0.13, 0.2 + 0.3 * j), rot=(-12, 0, 0),
                mat=flat((B.SKY, B.CORAL, B.LEMON, B.MINT, B.PINK, B.TURQ)[j * 2 + k], 0.6), bevel=0.01)
    mark('staff', (cx, cy + 0.25, 0.0), facing=(0, -1, 0))
    for k in range(2):
        mark('customer', (cx - 0.05 * k, cy - 1.15 - 0.45 * k, 0.0), facing=(0, 1, 0))
    mark('customer', (mx, my - 0.6, 0.0), facing=(0, 1, 0))
    mark('in', (cx - 0.6, cy + 1.25, 0.0))
    B.light_pt((cx, cy - 0.8, PL + 1.3), 'window', 0.9)
    return {'fx': {'sign': (cx + 0.1, cy - 0.1, PL + H_ + 1.45)}, 'overlay_plane': True}


# =========================================================================== RESTROOM + SHOWERS

WC_NOTE = ('Restrooms & showers (3.6 x 2.8 m): small white-and-aqua tiled block with two doors (blue / pink) under a '
           'pictogram sign, a water tank on the flat roof, and on the visible side two outdoor showers on a wooden '
           'grate with a foot-wash tap and a bench.  showerPoints = where a character stands under a shower '
           '(fxPoints.shower0 / shower1 = shower heads for the water fx); staffPoints = cleaner; customerPoints = '
           'waiting at the doors.')


@bbld('restroom_shower', 'building', 'bbld_civic', fp=(3.6, 2.8), notes=WC_NOTE, ko='화장실·샤워장',
      en='Restrooms & showers', zone='beach_ops')
def b_restroom_shower():
    BX, BY, W, D = -0.55, 0.4, 2.3, 1.7
    PL, WH = 0.12, 2.1
    wall = B.tile_mat('#F7F7F2', '#EEF1EC', 5.0, '#D9DDD6')
    x0, x1, y0, y1 = B.shell('walls', BX, BY, W, D, PL, PL + WH, wall, plinth='#C9CED6', trim=None)
    box('wainscot', (W + 0.04, D + 0.04, 0.75), (BX, BY, PL), mat=B.tile_mat('#7FD6E3', '#6CCAD8', 6.0, '#E9F9FB'),
        bevel=0.02)
    B.roof_deck('roof', W + 0.1, D + 0.1, PL + WH, x=BX, y=BY, wall=B.STUCCO_W, cap=B.AQUA, parapet=0.16)
    cyl('tank', 0.32, 0.55, (BX - 0.5, BY + 0.3, PL + WH + 0.14), mat=flat('#5C8FD6', 0.4), segs=20, bevel=0.03)
    cyl('vent', 0.08, 0.3, (BX + 0.6, BY + 0.35, PL + WH + 0.14), mat=flat('#C9CED6', 0.4, 0.5), segs=10)
    for k, (dx, c) in enumerate(((-0.55, '#3D7CC9'), (0.45, '#E8749A'))):
        T.door('door%d' % k, (BX + dx, y0, PL), 'y-', w=0.62, h=1.4, col=c, frame_col=B.STUCCO_W, glass=False,
               step=False)
    emblem_disc('wcsign', (BX - 0.05, y0 - 0.2, PL + 1.82), lambda s: B.em_figures(s), r=0.32, bg=B.WHITE,
                rim=B.AQUA, es=0.9, tilt=0.0)
    T.win('wv1', (x1, BY + 0.2, PL + 1.85), 'x+', w=0.6, h=0.22, seed=3, cross=False)
    # outdoor showers on a wooden grate (visible side)
    gx0, gx1 = x1 + 0.15, x1 + 1.35
    B.plank_floor('grate', gx0, gx1, BY - 0.85, BY + 0.85, z=0.04, t=0.05, along='y', seed=6)
    st = flat('#D7DEE6', 0.2, 0.9)
    heads = []
    for k, sy in enumerate((BY - 0.45, BY + 0.45)):
        sx = x1 + 0.28
        cyl('spost%d' % k, 0.04, 2.0, (sx, sy, 0.0), mat=st, segs=10)
        box('sarm%d' % k, (0.42, 0.04, 0.04), (sx + 0.21, sy, 1.96), mat=st, bevel=0.0)
        cyl('shead%d' % k, 0.1, 0.05, (sx + 0.42, sy, 1.9), mat=st, segs=14)
        cyl('valve%d' % k, 0.04, 0.06, (sx + 0.05, sy, 1.2), rot=(0, 90, 0), mat=flat(B.RED, 0.4), segs=10)
        heads.append((sx + 0.42, sy, 1.85))
    cyl('tap', 0.03, 0.4, (gx1 - 0.15, BY - 0.85, 0.0), mat=st, segs=8)
    box('tapsp', (0.12, 0.03, 0.03), (gx1 - 0.15, BY - 0.9, 0.38), mat=st, bevel=0.0)
    T.town_bench('bench', (BX - 0.2, y0 - 0.7, 0.0), rot_z=0.0, col=B.WOOD, iron='#E9E4DA', snow=False)
    H.life_ring('lring', (x0 + 0.02, BY - 0.3, 1.2), rz=-90.0)
    for k, p in enumerate(heads):
        mark('shower', (p[0], p[1], 0.04), facing=(-1, 0, 0))
    mark('staff', (BX + 0.95, y0 - 0.45, 0.0), facing=(-0.3, -1, 0))
    for k, dx in enumerate((-0.55, 0.45)):
        mark('door', (BX + dx, y0 - 0.45, 0.0), facing=(0, 1, 0))
        mark('customer', (BX + dx, y0 - 1.25, 0.0), facing=(0, 1, 0))
    mark('seat', (BX - 0.2, y0 - 0.7, 0.0), facing=(0, -1, 0))
    mark('in', (x0 - 0.6, y1 - 0.2, 0.0))
    B.light_pt((BX - 0.05, y0 - 0.25, PL + 1.6), 'lamp', 0.7)
    return {'fx': {'shower0': heads[0], 'shower1': heads[1]}}


# =========================================================================== MINI AQUARIUM

AQ_NOTE = ('Mini aquarium "꼬마 수족관" (4.6 x 3.8 m): white building with a wave-shaped blue roof and a smiling whale on '
           'top, a big glowing glass tank bay on the front full of coral, sea-grass, a turtle and fish, a ticket '
           'window by the door.  anims.work / anims.fish = 4 f: two schools of fish swim across the tank in opposite '
           'directions and bubbles rise (seamless loop).  viewPoints = visitors in front of the glass (facing it); '
           'staffPoints = ticket seller; inPoint = where donated rare fish are delivered (mission).')


@bbld('mini_aquarium', 'building', 'bbld_civic', fp=(4.6, 3.8), work=4, fps=5, notes=AQ_NOTE, ko='꼬마 수족관',
      en='Mini aquarium', zone='attraction', anim_name='fish')
def b_mini_aquarium():
    BX, BY, W, D = 0.0, 0.85, 3.6, 2.2
    PL, WH = 0.15, 2.35
    x0, x1, y0, y1 = B.shell('walls', BX, BY, W, D, PL, PL + WH, B.STUCCO_W, plinth='#C9CED6', trim=None)
    box('wave', (W + 0.04, D + 0.04, 0.5), (BX, BY, PL), mat=flat('#5C8FD6', 0.5), bevel=0.02)
    # wave roof: barrel vault along X with wave stripes
    import harbor_assets as HA
    HA.vault('vroof', W + 0.3, D / 2 + 0.2, 0.55, (BX - W / 2 - 0.15, BY, PL + WH),
             L.stripes('#3D7CC9', '#5C9FE0', 1.0 / 0.25, 'Y', rough=0.5, soft=0.15), cap=flat('#5C8FD6', 0.5))
    T.emblem_at('whale', lambda s: B.em_whale(s), (BX + 0.2, BY + 0.1, PL + WH + 1.15), psi=B.psi(), scale=1.5,
                tilt=4.0)
    # tank bay (front left): frame + glowing water box + content
    TW_, TH_, TD_ = 2.0, 1.45, 0.75
    tx, tz = BX - 0.55, PL + 0.25
    ty0 = y0 - TD_ + 0.1
    fm = flat(B.STUCCO_W, 0.5)
    box('tframe_b', (TW_ + 0.2, TD_ + 0.1, 0.12), (tx, y0 - TD_ / 2 + 0.05, tz - 0.12), mat=fm, bevel=0.03)
    box('tframe_t', (TW_ + 0.2, TD_ + 0.1, 0.14), (tx, y0 - TD_ / 2 + 0.05, tz + TH_), mat=fm, bevel=0.03)
    for s in (-1, 1):
        box('tframe_s', (0.1, TD_ + 0.1, TH_), (tx + s * (TW_ / 2 + 0.05), y0 - TD_ / 2 + 0.05, tz), mat=fm, bevel=0.02)
    wmat = L.emissive('tankwater', '#3FA9E0', '#2F9AD8', 0.95)
    B.night(wmat, '#4FB8F0', 2.2)
    box('twater', (TW_, 0.05, TH_), (tx, y0 + 0.03, tz), mat=wmat, bevel=0.0)
    for s in (-1, 1):
        box('twside', (0.03, TD_ - 0.1, TH_), (tx + s * (TW_ / 2 - 0.02), y0 - TD_ / 2 + 0.07, tz),
            mat=L.emissive('tws%d' % (s > 0), '#5FB8E6', '#4FB0E0', 0.35), bevel=0.0)
    box('ttop', (TW_, TD_ - 0.1, 0.03), (tx, y0 - TD_ / 2 + 0.07, tz + TH_ - 0.03),
        mat=L.emissive('ttopm', '#BFE9F8', '#9FDCF5', 0.6), bevel=0.0)
    box('tglass', (TW_, 0.02, TH_), (tx, ty0 - 0.01, tz), mat=B.tank_glass('tglass', '#CFF0FA', 0.1, 0.0), bevel=0.0)
    L.point_light('tankL', (tx - 0.3, y0 - 0.35, tz + TH_ - 0.15), '#DDF4FF', 70.0, 0.3)
    L.point_light('tankL2', (tx + 0.5, y0 - 0.45, tz + 0.5), '#BFE9FF', 30.0, 0.3)
    box('tlip', (TW_ + 0.22, 0.06, 0.08), (tx, ty0 - 0.04, tz + TH_ + 0.1), mat=flat(B.TURQ, 0.5), bevel=0.02)
    box('tlip2', (TW_ + 0.22, 0.06, 0.06), (tx, ty0 - 0.04, tz - 0.1), mat=flat(B.TURQ, 0.5), bevel=0.02)
    gm = flat('#F2FBFF', 0.05)
    for k in range(3):
        box('tsheen%d' % k, (0.05, 0.01, TH_ * 0.6), (tx - 0.7 + 0.25 * k, ty0 - 0.025, tz + 0.3), rot=(0, -28, 0),
            mat=gm, bevel=0.0)
    # content: sand, rocks, coral, sea grass, turtle
    box('tsand', (TW_ - 0.05, TD_ - 0.1, 0.12), (tx, y0 - TD_ / 2 + 0.07, tz), mat=flat('#F2E2B8', 0.8), bevel=0.02)
    rnd = L.rng(21)
    for k in range(6):
        x = tx - 0.85 + 0.34 * k
        h = rnd.uniform(0.4, 0.95)
        for j in range(3):
            cyl('grass', 0.025, h * rnd.uniform(0.7, 1.0), (x + 0.04 * j, y0 - 0.2, tz + 0.1),
                mat=flat(('#3E9A5A', '#58B36B')[j % 2], 0.6), segs=6, r_top=0.008, rot=(0, rnd.uniform(-12, 12), 0))
    for k, (dx, c) in enumerate(((-0.55, '#F48FB1'), (0.25, '#F28C38'), (0.7, '#B9A3E3'))):
        for j in range(4):
            sphere('coral', 0.07 + 0.02 * (j % 2), (tx + dx + rnd.uniform(-0.1, 0.1), y0 - 0.32, tz + 0.15 + 0.08 * j),
                   flat(c, 0.6), segs=10, rings=6)
    with L.Collect() as tc:
        sphere('tshell', 0.16, (0, 0, 0), flat('#5FA97A', 0.6), scale=(1.2, 1.0, 0.55), segs=16, rings=10)
        sphere('thead', 0.07, (0.22, 0, 0.02), flat('#8FD08A', 0.6), segs=12, rings=8)
        for s in (-1, 1):
            sphere('tfin', 0.06, (0.08, s * 0.16, -0.02), flat('#8FD08A', 0.6), scale=(1.4, 0.6, 0.3), segs=10,
                   rings=6)
    turtle = L.group(BA.top_level(tc.objs), 'turtle', loc=(tx + 0.45, y0 - 0.35, tz + 1.0), rot=(70, 0, 15))
    # fish schools (animated): right-movers and left-movers, wrapping across the tank
    fish = []
    cols = ('#F2C14E', '#F08A5D', '#5BC8D8', '#F48FB1', '#F4F1EA', '#F28C38')
    for k in range(7):
        d = 1 if k % 2 == 0 else -1
        z = tz + 0.32 + 0.15 * k
        y = y0 - 0.3 - 0.05 * (k % 3)
        o = PA.fish_model('afish%d' % k, length=0.34, height=0.17, thick=0.08, loc=(tx, y, z), rot=(90, 0, 0))
        body = bpy.data.objects.get('afish%d_body' % k)
        if body is not None:
            body.data.materials[0] = flat(cols[k % len(cols)], 0.45)
        fish.append((o, d, (k * 0.37) % 1.0, z))
    bubbles = []
    for k in range(5):
        b = sphere('bub%d' % k, 0.03 + 0.008 * (k % 2), (tx - 0.6 + 0.3 * k, y0 - 0.2, tz), flat('#F2FBFF', 0.1), segs=8,
                   rings=6)
        b.visible_shadow = False
        bubbles.append((b, k / 5.0))
    # door + ticket window (right)
    dxp = BX + 1.1
    T.door('door', (dxp, y0, PL), 'y-', w=0.7, h=1.45, col='#3D7CC9', frame_col=B.STUCCO_W, glass=True,
           step_col='#C9CED6', step_depth=0.3)
    B.gwin('ticket', (dxp + 0.55, y0, PL + 0.9), 'y-', w=0.32, h=0.38, frame='#3D7CC9', curtain=None)
    box('tshelf', (0.42, 0.18, 0.04), (dxp + 0.55, y0 - 0.1, PL + 0.86), mat=flat('#3D7CC9', 0.5), bevel=0.01)
    T.win('sw', (x1, BY + 0.2, PL + 1.7), 'x+', w=0.55, round_=True, seed=5)
    B.pot_plant('ap1', (dxp + 0.7, y0 - 0.5, 0.0), r=0.17, kind='agave', seed=4)
    mark('door', (dxp, y0 - 0.55, 0.0), facing=(0, 1, 0))
    mark('staff', (dxp + 0.6, y0 - 0.45, 0.0), facing=(-0.3, -1, 0))
    for k in range(3):
        mark('view', (tx - 0.6 + 0.6 * k, ty0 - 0.55, 0.0), facing=(0, 1, 0))
    mark('customer', (dxp + 0.05, y0 - 1.0, 0.0), facing=(0, 1, 0))
    mark('in', (x1 + 0.65, y1 - 0.3, 0.0))
    B.light_pt((tx, ty0 - 0.05, tz + 0.7), 'tank', 1.4)

    def place(i):
        t4 = i / 4.0
        for o, d, ph, z in fish:
            u = (ph + t4) % 1.0
            x = tx - TW_ / 2 + 0.15 + (TW_ - 0.3) * (u if d > 0 else 1.0 - u)
            o.location.x = x
            o.location.z = z + 0.04 * math.sin(math.tau * (u * 2 + ph))
            sc = min(1.0, min(u, 1.0 - u) / 0.12)
            o.scale = (max(0.01, sc) * d, max(0.01, sc), max(0.01, sc))
        for b, ph in bubbles:
            u = (ph + t4) % 1.0
            b.location.z = tz + 0.15 + (TH_ - 0.3) * u
            b.location.x = tx - 0.6 + 0.3 * bubbles.index((b, ph)) + 0.03 * math.sin(math.tau * u * 2)

    def idle():
        place(0)

    def work(i):
        place(i)
    return {'idle': idle, 'work': work, 'fx': {'tank': (tx, ty0, tz + 0.7), 'whale': (BX + 0.2, BY + 0.1, PL + WH + 1.7)}}


# =========================================================================== BEACH ARCADE

ARC_NOTE = ('Beach arcade "반짝 오락실" (4.0 x 3.6 m): lilac-and-pink fun house with a wide open entrance under a '
            'striped awning, two claw machines full of plush balls flanking it, a coin booth, a big star-and-coin '
            'marquee on the roof and marquee bulbs around the facade.  anims.work / anims.lights = 4 f chasing bulbs '
            '(seamless).  customerPoints = kids at the claw machines (facing them); staffPoints = coin booth attendant.')


@bbld('beach_arcade', 'building', 'bbld_shops', fp=(4.0, 3.6), work=4, fps=8, notes=ARC_NOTE, ko='반짝 오락실',
      en='Beach arcade', zone='attraction', anim_name='lights')
def b_beach_arcade():
    BX, BY, W, D = 0.0, 0.85, 3.2, 2.0
    PL, WH = 0.12, 2.45
    x0, x1, y0, y1 = BX - W / 2, BX + W / 2, BY - D / 2, BY + D / 2
    T.plinth('pl', W, D, h=PL, col='#C9CED6', x=BX, y=BY)
    wm = B.stucco('#C9B6EE')
    OX0, OX1, OH = BX - 0.75, BX + 0.75, PL + 1.85
    wall_open('fwall', x0, x1, y0, PL, PL + WH, (OX0, OX1, PL, OH), wm, t=0.14)
    box('bwall', (W, 0.12, WH), (BX, y1 - 0.06, PL), mat=wm, bevel=0.02)
    for s in (-1, 1):
        box('swall', (0.12, D - 0.24, WH), (BX + s * (W / 2 - 0.06), BY, PL), mat=wm, bevel=0.02)
    T.corner_trims('ct', W, D, PL, WH, '#F59AB5', t=0.14, x=BX, y=BY)
    B.roof_deck('roof', W + 0.1, D + 0.1, PL + WH, x=BX, y=BY, wall='#F59AB5', cap=B.LEMON, parapet=0.22)
    # interior: glowing colourful back, machines silhouettes
    box('ifloor', (W - 0.25, D - 0.25, 0.03), (BX, BY, PL), mat=B.tile_mat('#7A5BC0', '#F59AB5', 2.5, '#5A3F99'),
        bevel=0.0)
    box('iback', (W - 0.3, 0.05, WH - 0.2), (BX, y1 - 0.15, PL), mat=T.glow_mat('iglow', 1.0, '#FFD6F2'), bevel=0.0)
    for k, c in enumerate((B.TURQ, B.CORAL, '#3D8BE0')):
        box('imach%d' % k, (0.45, 0.4, 1.35), (BX - 0.6 + 0.6 * k, y1 - 0.45, PL), mat=flat(c, 0.4), bevel=0.04)
        box('iscr%d' % k, (0.32, 0.02, 0.26), (BX - 0.6 + 0.6 * k, y1 - 0.66, PL + 0.95),
            mat=B.neon_mat('iscr%d' % k, ('#9BE3FF', '#FFF3A0', '#FFB8E8')[k], 1.4, 3.0), bevel=0.0)
    # claw machines flanking the entrance
    for k, s in enumerate((-1, 1)):
        mx = BX + s * 1.15
        my = y0 - 0.42
        c = (B.PINK, B.TURQ)[k]
        box('cbase%d' % k, (0.6, 0.55, 0.75), (mx, my, 0.0), mat=flat(c, 0.4), bevel=0.04)
        box('cglass%d' % k, (0.56, 0.5, 0.8), (mx, my, 0.75), mat=B.tank_glass('cgl%d' % k, '#E6F7FB', 0.22, 0.15,
                                                                                '#FFF1C8'), bevel=0.01)
        box('ctop%d' % k, (0.62, 0.57, 0.18), (mx, my, 1.55), mat=flat(c, 0.4), bevel=0.04)
        box('csign%d' % k, (0.5, 0.04, 0.12), (mx, my - 0.29, 1.58), mat=B.neon_mat('csg%d' % k, B.LEMON, 1.2, 3.5),
            bevel=0.01)
        for j in range(7):
            sphere('plush%d%d' % (k, j), 0.07, (mx - 0.18 + 0.12 * (j % 4), my - 0.1 + 0.15 * (j // 4), 0.8 +
                                               0.02 * (j % 2)),
                   flat((B.LEMON, B.PINK, B.MINT, B.CORAL, B.SKY, B.LILAC, B.WHITE)[j], 0.7), segs=10, rings=8)
        cyl('claw%d' % k, 0.01, 0.35, (mx, my, 1.2), mat=flat('#C9CED6', 0.3, 0.8), segs=6)
        sphere('clawh%d' % k, 0.05, (mx, my, 1.2), flat('#C9CED6', 0.3, 0.8), segs=10, rings=6)
        cyl('joy%d' % k, 0.015, 0.1, (mx + 0.12, my - 0.22, 0.75), mat=flat(B.INK, 0.4), segs=6)
        sphere('joyb%d' % k, 0.035, (mx + 0.12, my - 0.22, 0.86), flat(B.RED, 0.3), segs=10, rings=6)
    # awning over the entrance
    B.awning_at('awn', 'y-', (BX, y0, OH + 0.32), 1.8, 0.6, 0.0, -0.3, '#F59AB5', B.WHITE, n=8)
    # marquee: star sign on the roof + bulbs (4 chase phases)
    groups = B.phase_mats('bulb', (B.LEMON, '#FFFFFF', B.PINK, '#9BE3FF'), n=4, day=0.9, strength=4.0)
    pts = []
    zt = PL + WH - 0.12
    n = 22
    for k in range(n):
        pts.append((x0 + 0.08 + (W - 0.16) * k / (n - 1), y0 - 0.1, zt))
    m = 12
    for k in range(m):
        pts.append((x1 + 0.1, y0 + 0.08 + (D - 0.16) * k / (m - 1), zt))
    for k in range(9):
        pts.append((OX0 - 0.12, y0 - 0.1, PL + 0.15 + (OH - PL - 0.15) * k / 8))
        pts.append((OX1 + 0.12, y0 - 0.1, PL + 0.15 + (OH - PL - 0.15) * k / 8))
    bulbs = []
    for k, p in enumerate(pts):
        g = groups[k % 4]
        mm = g[(k // 4) % len(g)]
        bulbs.append(sphere('bulb%d' % k, 0.06, p, mm, segs=10, rings=6))
    # roof marquee star (big) with its own ring of bulbs
    sx, sy, sz = BX + 0.15, BY - 0.05, PL + WH + 1.15
    a = math.radians(B.psi())
    for s in (-1, 1):
        cyl('sleg', 0.04, 0.6, (sx + s * 0.35 * math.cos(a), sy + s * 0.35 * math.sin(a), PL + WH + 0.1),
            mat=flat('#9AA3AE', 0.4, 0.5), segs=8)
    T.emblem_at('star', lambda s: B.em_joystick(s), (sx, sy, sz), psi=B.psi(), scale=1.6, tilt=6.0)
    ring = []
    for k in range(16):
        t = math.tau * k / 16
        r = 0.72
        lx, lz = r * math.cos(t), r * math.sin(t)
        ring.append(sphere('sbulb%d' % k, 0.06, (sx + lx * math.cos(a), sy + lx * math.sin(a), sz + lz),
                           groups[k % 4][(k // 4) % 4], segs=8, rings=6))
    # coin booth (right side, visible)
    cbx, cby = x1 + 0.45, y0 + 0.25
    box('booth', (0.6, 0.6, 1.15), (cbx, cby, 0.0), mat=flat(B.LEMON, 0.5), bevel=0.04)
    box('boothtop', (0.7, 0.7, 0.08), (cbx, cby, 1.15), mat=flat('#F59AB5', 0.5), bevel=0.02)
    cyl('coins', 0.12, 0.05, (cbx, cby - 0.15, 1.23), mat=flat(B.GOLD, 0.3, 0.8), segs=16)
    T.win('sw', (x1, BY + 0.55, PL + 1.7), 'x+', w=0.55, round_=True, seed=6)
    mark('staff', (cbx - 0.05, cby - 0.6, 0.0), facing=(-0.3, -1, 0))
    for k, s in enumerate((-1, 1)):
        mark('customer', (BX + s * 1.15, y0 - 1.05, 0.0), facing=(0, 1, 0))
    mark('door', (BX, y0 - 0.45, 0.0), facing=(0, 1, 0))
    mark('in', (x0 - 0.6, BY + 0.4, 0.0))
    B.light_pt((BX, y0 - 0.3, PL + 1.2), 'window', 1.3)
    B.light_pt((sx, sy, sz), 'sign', 1.4)

    def idle():
        B.set_phase(groups, 0, hi=1.2, lo=1.2)

    def work(i):
        B.set_phase(groups, i, hi=3.2, lo=0.05)
    return {'idle': idle, 'work': work, 'fx': {'star': (sx, sy, sz), 'coins': (cbx, cby - 0.15, 1.3)}}


# =========================================================================== BEACH GATE

GATE_NOTE = ('Beach entrance gate "햇살 해변" (5.4 x 1.2 m): two rope-wrapped driftwood pillars with starfish and life '
             'rings, a curved wooden arch carrying a big BLANK sign board (fxPoints.boardCentre - the game writes '
             '"햇살 해변"), a smiling sun on top, pennant flags, agave pots.  The passage runs along world %s; faces %s.')


def gate_builder():
    G = 2.0
    drift = L.stripes('#D8CBB6', '#C4B59A', 1.0 / 0.35, 'Z', rough=0.85, soft=0.3)
    rope = flat('#D9C39A', 0.85)
    PH = 2.9
    for s in (-1, 1):
        x = s * G
        cyl('pillar', 0.24, PH, (x, 0, 0), mat=drift, segs=16, r_top=0.21, bevel=0.03)
        for k in range(4):
            H.torus('rope%d' % k, 0.24 - 0.008 * k, 0.03, (x, 0, 0.5 + 0.55 * k + (0.06 if k % 2 else 0)), mats=[rope],
                    M=24, K=8)
        cyl('pbase', 0.36, 0.2, (x, 0, 0), mat=tonal('#BFAE92', 0.06, 4.0), segs=16, bevel=0.03)
        T.emblem_at('pstar', lambda s_: B.em_starfish(s_, col=(B.CORAL if s < 0 else B.LEMON)), (x, -0.05, PH + 0.25),
                    psi=0.0, scale=0.55)
        H.life_ring('pring', (x, -0.27, 1.25), rz=0.0, R=0.2, r=0.06)
        B.pot_plant('ppot', (x + s * 0.55, -0.25, 0.0), r=0.2, kind='agave', seed=3 + s)
    # curved arch beam
    wm = tonal(B.WOOD, 0.06, 4.0)
    pts = [(-G - 0.05, 0.0, 2.45 + 0.0), (-G * 0.5, 0.0, 2.85), (0.0, 0.0, 2.98), (G * 0.5, 0.0, 2.85),
           (G + 0.05, 0.0, 2.45)]
    L.smooth_tube('arch', pts, 0.11, wm)
    # sign board (blank) hanging below the arch
    B.sign_board('board', (0.0, -0.08, 2.3), w=2.7, h=0.6, bg='#FFF6E0', frame=B.TURQ, psi_=0.0)
    for s in (-1, 1):
        cyl('hang', 0.012, 0.25, (s * 1.1, -0.06, 2.6), mat=rope, segs=6)
    for k in range(6):
        with L.Collect() as sc:
            B.em_shell(0.16, col=(B.PEACH, B.PINK)[k % 2])
        L.group(BA.top_level(sc.objs), 'bshell%d' % k, loc=(-1.25 + 0.5 * k, -0.17, 1.98), rot=(0, 0, 0))
    T.emblem_at('sun', lambda s: B.em_sun(s), (0.0, -0.12, 3.45), psi=0.0, scale=0.95)
    B.pennant_line('pen1', (-G, -0.05, 2.9), (-0.55, -0.05, 3.05), n=6, sag=0.25)
    B.pennant_line('pen2', (0.55, -0.05, 3.05), (G, -0.05, 2.9), n=6, sag=0.25)
    for s in (-1, 1):
        B.light_pt((s * G, -0.3, 2.2), 'lamp', 0.7)
        PA.lantern('glan%d' % (s > 0), (s * G, -0.32, 1.85), 0.13, 3.0)
    return {'fx': {'boardCentre': (0.0, -0.14, 2.3), 'sun': (0.0, -0.12, 3.45)},
            'extra': {'passage': 'between the pillars (x in [-1.75, 1.75] m, both directions)'}}


@bbld('beach_gate', 'decor', 'bbld_street', fp=(5.4, 1.2), catcher=18.0,
      notes=GATE_NOTE % ('Y (screen up-right <-> down-left)', 'screen down-left (-Y)'), ko='햇살 해변 입구',
      en='Beach gate', zone='street')
def b_beach_gate():
    return gate_builder()


variant_x('beach_gate', gate_builder)
BBLD_GATE_X_NOTE = GATE_NOTE % ('X (screen up-left <-> down-right)', 'screen down-right (+X)')


# =========================================================================== LAMP + STRING LIGHTS

@bbld('beach_lamp', 'decor', 'bbld_street', fp=('r', 0.25), catcher=10.0,
      notes='Seaside lamp post (white fluted post, turquoise nautical lantern head, ~2.9 m). fxPoints.light = lantern '
            'centre; lightPoints[0] the same (night glow).', ko='해변 가로등', en='Beach lamp', zone='street')
def b_beach_lamp():
    objs, lp = B.lamp_post('lamp', (0.0, 0.0, 0.0), h=2.5)
    return {'fx': {'light': lp}}


SL_NOTE = ('Party string lights (4.2 m): two white posts with a sagging string of coloured bulbs (axis %s). Chain '
           'them post-to-post every 4.0 m (%s). anims.work / anims.twinkle = 4 f gentle chase; lightPoints = bulbs '
           'for night glow (or use the _glow overlay).')


def string_builder():
    wm = flat(B.STUCCO_W, 0.5)
    groups = B.phase_mats('sl', (B.LEMON, B.CORAL, B.AQUA, B.PINK, '#9BE37A'), n=4, day=0.8, strength=4.5)
    X = 2.0
    for s in (-1, 1):
        cyl('post', 0.05, 2.45, (s * X, 0.0, 0.0), mat=wm, segs=10)
        cyl('pfoot', 0.12, 0.1, (s * X, 0.0, 0.0), mat=wm, segs=12)
        sphere('ptop', 0.06, (s * X, 0.0, 2.48), flat(B.TURQ, 0.4), segs=10, rings=6)
    a, b = Vector((-X, 0.0, 2.38)), Vector((X, 0.0, 2.38))
    pts = []
    for k in range(13):
        t = k / 12
        p = a.lerp(b, t)
        p.z -= 0.45 * 4 * t * (1 - t)
        pts.append(tuple(p))
    L.smooth_tube('wire', pts, 0.008, flat('#3D424C', 0.6))
    n = 14
    for k in range(n):
        t = (k + 0.5) / n
        p = a.lerp(b, t)
        p.z -= 0.45 * 4 * t * (1 - t)
        m = groups[k % 4][k % 5]
        cyl('cap%d' % k, 0.022, 0.05, (p.x, p.y, p.z - 0.04), mat=flat('#3D424C', 0.5), segs=8)
        sphere('bulb%d' % k, 0.05, (p.x, p.y, p.z - 0.1), m, scale=(1, 1, 1.2), segs=10, rings=8)
        if k % 3 == 1:
            B.light_pt((p.x, p.y, p.z - 0.1), 'bulb', 0.45)

    def idle():
        B.set_phase(groups, 0, hi=1.4, lo=1.0)

    def work(i):
        B.set_phase(groups, i, hi=2.2, lo=0.6)
    return {'idle': idle, 'work': work}


@bbld('string_lights_x', 'decor', 'bbld_street', fp=(4.2, 0.3), catcher=12.0, work=4, fps=4,
      notes=SL_NOTE % ('world X, screen up-left <-> down-right', 'step (+181, +91) px along +X'),
      ko='전구 줄', en='String lights', zone='street', anim_name='twinkle')
def b_string_lights_x():
    return string_builder()


@bbld('string_lights_y', 'decor', 'bbld_street', fp=(4.2, 0.3), yaw=90.0, catcher=12.0, work=4, fps=4,
      notes=SL_NOTE % ('world Y, screen down-left <-> up-right', 'step (+181, -91) px along +Y'),
      ko='전구 줄', en='String lights', zone='street', anim_name='twinkle')
def b_string_lights_y():
    return string_builder()


# the gate_x note
import bbld_assets as _BA  # noqa: E402
_BA.BBLD['beach_gate_x']['notes'] = BBLD_GATE_X_NOTE
_BA.BBLD['beach_gate_x']['catcher'] = 18.0
