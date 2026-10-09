"""
bbld_assets.py - beachfront buildings of "햇살 해변" (docs/CONTRACT_V7.md §X): registry + the hero builders
(resort_hotel, hotel_pool, beach_cafe, icecream_shop).  The other buildings are in bbld_assets2.py (imported at the
bottom, registers into the same BBLD).

Registry BBLD maps a build key to its builder + metadata (bld_assets.BLD format + name / zone), rendered by
bbld_render.render_bbld().  bbld_pack.py packs assets/beach_bld/.

Conventions (as town_assets / harbor_assets, plus bbld_lib)
  * 1 unit = 1 m, world origin = footprint centre = sprite anchor; local front = -Y (screen down-left) = the SEA side
    (like the harbour waterfront).  `<key>_x` = the same build rendered with yaw 90: front = +X (screen down-right),
    for a coastline along the other iso axis; its other visible face is the model's -X side.
  * no snow (warm current coast); white / pastel stucco, awnings, wooden decks; same light, PPU and outline-free
    baked-shadow building convention as the other sets.
  * Interaction markers (bld_assets.mark -> px offsets from the anchor in the manifest):
        door -> doorPoint (+doorDir)   staff -> staffPoints/staffDirs   customer -> customerPoints/customerDirs
        in -> inPoint                  seat -> seatPoints/seatDirs       balcony -> balconyPoints/balconyDirs
        lie -> lyingPoints/lyingDirs   swim -> swimPoints (on the pool water plane)   work -> workPoints/workDirs
        light -> lightPoints (+ lightKinds / lightSizes)                 view -> viewPoints (aquarium glass)
  * A builder may return {'idle', 'work', 'fx', 'extra', 'water', 'holes', 'overlay'} (see bbld_render).

Not run directly - see bbld_render.py.
"""
import math
from collections import OrderedDict

import bpy  # noqa: F401
from mathutils import Vector

import prop_lib as L
from prop_lib import flat, tonal, box, cyl, sphere, blob, extrude, hexmix
import prop_assets as PA
import life_assets as LA
import bld_assets as BA
import town_lib as T
import harbor_lib as H
import bbld_lib as B
from bld_assets import mark

BBLD = OrderedDict()


def bbld(key, kind, atlas, fp=None, yaw=0.0, shadow=True, samples=28, notes='', front='-Y', catcher=26.0, work=0,
         fps=8, extra=None, ko=None, en=None, zone=None, anim_name=None):
    def deco(fn):
        ex = dict(extra or {})
        if ko or en:
            ex['name'] = {'ko': ko or key, 'en': en or key}
        if zone:
            ex['zone'] = zone
        BBLD[key] = dict(key=key, fn=fn, kind=kind, atlas=atlas, fp=fp, yaw=yaw, shadow=shadow, samples=samples,
                         notes=notes, front=front, catcher=catcher, work=work, fps=fps, item=None, sprites=None,
                         extra=ex, anim_name=anim_name)
        return fn
    return deco


def variant_x(key, fn, **kw):
    """Register <key>_x = the same builder at yaw 90 (front = +X, screen down-right)."""
    base = BBLD[key]
    notes = base['notes'] + ' [_x variant: rendered with yaw 90 -> the front faces +X (screen down-right) for a ' \
                            'coastline along world Y; every point / poly is already rotated.]'
    ex = dict(base['extra'])
    ex['variantOf'] = key
    BBLD[key + '_x'] = dict(base, key=key + '_x', fn=fn, yaw=90.0, front='+X', notes=notes, extra=ex, **kw)


def side_faces():
    """The side face the camera sees for the current yaw: 'x+' (yaw 0) or 'x-' (yaw 90 variants)."""
    return 'x+' if abs(B.YAW) < 1 else 'x-'


def wface(face, x0, x1, y0, y1):
    """(wall coordinate, centre along the wall, wall length) of a face of the box x0..x1, y0..y1."""
    if face == 'y-':
        return y0, (x0 + x1) / 2, x1 - x0
    if face == 'x+':
        return x1, (y0 + y1) / 2, y1 - y0
    if face == 'x-':
        return x0, (y0 + y1) / 2, y1 - y0
    return y1, (x0 + x1) / 2, x1 - x0


def on_face(face, wall, u, z):
    """Point on a face: u = coordinate along the wall (world x for y-, world y for x+/x-)."""
    if face in ('y-', 'y+'):
        return (u, wall, z)
    return (wall, u, z)


def out_dir(face):
    return {'y-': (0, -1, 0), 'x+': (1, 0, 0), 'x-': (-1, 0, 0), 'y+': (0, 1, 0)}[face]


def along_sign(face):
    """Face-frame +x expressed along the world wall axis (y- : +x, x+ : +y, x- : -y)."""
    return {'y-': 1.0, 'x+': 1.0, 'x-': -1.0, 'y+': -1.0}[face]


def wall_open(name, x0, x1, y_wall, z0, z1, hole, mat, t=0.12):
    """Front (y-) wall slab from x0..x1, z0..z1 with one rectangular hole (hx0, hx1, hz0, hz1) - the wall's outer face
    is at y_wall, the slab goes +Y (inside) by t."""
    hx0, hx1, hz0, hz1 = hole
    objs = []
    for (a0, a1, b0, b1) in ((x0, hx0, z0, z1), (hx1, x1, z0, z1), (hx0, hx1, z0, hz0), (hx0, hx1, hz1, z1)):
        if a1 - a0 > 0.01 and b1 - b0 > 0.01:
            objs.append(box(name, (a1 - a0, t, b1 - b0), ((a0 + a1) / 2, y_wall + t / 2, b0), mat=mat, bevel=0.02))
    return objs


# =========================================================================== RESORT HOTEL

HOTEL_NOTE = ('Resort hotel "햇살 리조트" (8.0 x 5.8 m, four storeys + a five-storey central tower, ~9.5 m with the dome '
              'flag): bright white stucco hotel under a terracotta barrel-tile hip roof (scalloped tile eaves, ridge '
              'caps, dormers, two chimneys, gulls on the ridge); a peach central tower with arched windows, flower '
              'boxes, sun plaques and a turquoise dome with a gold finial and flag; CHECKERBOARD balconies (no '
              'balcony right above another, so a guest standing on one never pokes into the one above) with tiny '
              'parasols, deck chairs, potted flowers and beach towels on the rails, shuttered windows with flower '
              'boxes in between; a warm-lit lobby (arched windows + glass doors) under coral awnings; an entrance '
              'canopy on white columns with a coral-striped top, flower planters and gold stars, a red carpet, '
              'palms, a concierge desk (bell + guest book) and a brass luggage trolley; a blank marquee sign board '
              'with bulbs and five stars on the roof (fxPoints.boardCentre - the game writes the name).  '
              'staffPoints = [doorman beside the carpet in front of the canopy, bellhop at the trolley, receptionist '
              'BEHIND the concierge desk]; staffDepths says how to sort each; customerPoints = arriving guests '
              '(queue at the desk); balconyPoints = guests on the balconies (draw at depth d + 0.5, then '
              'resort_hotel_front = railings + towels + desk at d + 1); inPoint = supply pad at the service door on '
              'the side.  Night: <key>_glow (lit windows, lobby, marquee bulbs, tower suns) in the light layer.')


def hotel_builder():
    rnd = L.rng(11)
    BX, BY, W, D = 0.0, 0.85, 7.0, 3.4
    x0, x1, y0, y1 = BX - W / 2, BX + W / 2, BY - D / 2, BY + D / 2
    PL, GF, ST, NF = 0.22, 1.75, 1.3, 3
    Z1 = PL + GF                         # first upper floor level
    ZT = Z1 + NF * ST                    # eaves
    TW, TP, TD = 2.0, 0.26, 1.7          # central tower width / projection / depth
    TZ = ZT + ST + 0.1                   # tower top (one storey above the eaves)
    side = side_faces()
    WALL = '#FFFCF5'
    WHITE_T = '#FFFFFF'
    walls = B.stucco(WALL, var=0.03)
    T.plinth('plinth', W, D, h=PL, col='#DCCFBA', x=BX, y=BY)
    box('walls', (W, D, ZT - PL), (BX, BY, PL), mat=walls, bevel=0.04)
    box('gfwall', (W + 0.06, D + 0.06, GF - 0.12), (BX, BY, PL), mat=B.stucco('#F7EEDF', var=0.03), bevel=0.03)
    for f in range(NF):
        T.band('band%d' % f, W, D, Z1 + f * ST - 0.07, B.TURQ if f == 0 else WHITE_T, h=0.08 if f else 0.1,
               out=0.04, x=BX, y=BY)
    T.band('cornice', W, D, ZT - 0.16, WHITE_T, h=0.16, out=0.08, x=BX, y=BY)
    T.band('cornice2', W, D, ZT - 0.24, B.TURQ, h=0.05, out=0.06, x=BX, y=BY)
    T.corner_trims('ctrim', W, D, Z1, ZT - Z1, WHITE_T, t=0.14, x=BX, y=BY)
    RISE, OVER = 1.15, 0.32
    roof_objs, roof_z = B.hip_roof('roof', x0, x1, y0, y1, ZT, RISE, over=OVER, col=B.TERRA, barrel=True)
    # ---- central tower (peach), one storey above the roof, turquoise dome
    tower = B.stucco('#F9CBA7', var=0.03)
    yt = y0 - TP
    box('tower', (TW, TD, TZ - PL), (BX, yt + TD / 2, PL), mat=tower, bevel=0.03)
    for s in (-1, 1):
        box('ttrim', (0.12, 0.12, TZ - Z1), (BX + s * TW / 2, yt, Z1), mat=flat(WHITE_T, 0.7), bevel=0.02)
    for z, h in ((ZT - 0.16, 0.16), (TZ - 0.18, 0.18)):
        box('tcorn', (TW + 0.16, TD + 0.16, h), (BX, yt + TD / 2, z), mat=flat(WHITE_T, 0.7), bevel=0.03)
    box('tband', (TW + 0.1, TD + 0.1, 0.09), (BX, yt + TD / 2, Z1 - 0.07), mat=flat(B.TURQ, 0.5), bevel=0.02)
    box('tparapet', (TW + 0.1, TD + 0.1, 0.22), (BX, yt + TD / 2, TZ), mat=flat(WHITE_T, 0.7), bevel=0.03)
    box('tpcap', (TW + 0.18, TD + 0.18, 0.06), (BX, yt + TD / 2, TZ + 0.22), mat=flat(B.TURQ, 0.5), bevel=0.02)
    DZ = TZ + 0.28
    cyl('drum', 0.66, 0.34, (BX, yt + TD / 2, DZ), mat=walls, segs=32, bevel=0.02)
    for k in range(8):
        a = math.tau * (k + 0.5) / 8
        B.gwin('drumw%d' % k, (BX + 0.62 * math.cos(a), yt + TD / 2 + 0.62 * math.sin(a), DZ + 0.06), 'y-', w=0.14,
               h=0.2, arch=True, sill=None, mull=False).rotation_euler.z = a + math.pi / 2
    cyl('drumband', 0.7, 0.06, (BX, yt + TD / 2, DZ + 0.3), mat=flat(B.GOLD, 0.3, 0.8), segs=32)
    sphere('dome', 0.68, (BX, yt + TD / 2, DZ + 0.34), flat(B.TURQ, 0.35), scale=(1.0, 1.0, 0.95), segs=32, rings=16)
    for k in range(8):                       # gold ribs on the dome
        a = math.tau * k / 8
        pts = [(BX + 0.69 * math.cos(a) * math.cos(t), yt + TD / 2 + 0.69 * math.sin(a) * math.cos(t),
                DZ + 0.34 + 0.655 * math.sin(t)) for t in [i * (math.pi / 2) / 8 for i in range(9)]]
        L.smooth_tube('drib%d' % k, pts, 0.018, flat(B.GOLD, 0.3, 0.8))
    cyl('domefin', 0.04, 0.5, (BX, yt + TD / 2, DZ + 0.95), mat=flat(B.GOLD, 0.3, 0.8), segs=10)
    sphere('domeball', 0.09, (BX, yt + TD / 2, DZ + 1.48), flat(B.GOLD, 0.3, 0.8), segs=12, rings=8)
    B.flag_pole('tflag', (BX + 0.02, yt + TD / 2, DZ + 1.52), h=0.85, col=B.CORAL, w=0.55, fh=0.34, seed=3)
    curtains = [B.MINT, B.PINK, B.LEMON, B.SKY, B.PEACH, B.LILAC, B.CORAL, B.AQUA]
    for f in range(NF + 1):
        z = Z1 + f * ST + 0.3
        B.gwin('tw%d' % f, (BX, yt, z), 'y-', w=0.66, h=0.84, arch=True, curtain=curtains[(f + 3) % 8],
               lit=rnd.random() > 0.15)
        if f < NF:
            box('twbox%d' % f, (0.74, 0.18, 0.12), (BX, yt - 0.06, z - 0.2), mat=flat(B.TURQ, 0.5), bevel=0.02)
            for k in range(5):
                sphere('twfl%d' % f, 0.06, (BX - 0.26 + 0.13 * k, yt - 0.12, z - 0.06),
                       flat((B.PINK, B.LEMON, B.CORAL, B.WHITE, B.PINK)[k], 0.5), segs=8, rings=6)
    # top storey of the tower: sun emblem plaques (lit at night) + side window
    for nm, sx_ in (('tsun', -0.62), ('tsun2', 0.62)):
        B.glow_objs(T.emblem_at(nm, lambda s: B.em_sun(s), (BX + sx_, yt - 0.06, TZ - 0.72), psi=0.0, scale=0.42),
                    strength=0.5)
    tsw = BX + TW / 2 if side == 'x+' else BX - TW / 2
    B.gwin('tsw', (tsw, yt + TD / 2, ZT + 0.32), side, w=0.5, h=0.7, arch=True, curtain=B.LEMON)

    def flower_box(name, loc_face, face, w=0.6):
        """window flower box on a face (loc = window bottom-centre on the wall)"""
        objs = [box(name, (w, 0.16, 0.12), (0, -0.09, -0.24), mat=flat(B.TURQ, 0.5), bevel=0.02)]
        for k in range(5):
            objs.append(sphere(name + '_f', 0.055, (-w / 2 + 0.08 + (w - 0.16) * k / 4, -0.12, -0.1),
                               flat((B.PINK, B.LEMON, B.CORAL, B.WHITE, B.PINK)[(k + len(name)) % 5], 0.5),
                               segs=8, rings=6))
            objs.append(sphere(name + '_l', 0.06, (-w / 2 + 0.12 + (w - 0.24) * k / 4, -0.08, -0.13),
                               flat(B.LEAF, 0.8), segs=8, rings=6))
        return T.face_group(objs, face, loc_face, name)

    # ---- wings: CHECKERBOARD balconies (outer half on floors 0 / 2, inner half on floor 1) so no balcony sits
    # right above another one: a guest (a ~1.5 m chibi) on a balcony never pokes into the balcony above
    wing_w = (W - TW) / 2
    wing_c = [x0 + wing_w / 2, x1 - wing_w / 2]
    items = [['parasol:%s:%s' % (B.CORAL, B.WHITE), 'chair:%s' % B.AQUA, 'towel:%s:0.34' % B.LEMON],
             ['towel:%s:-0.3' % B.PINK, 'chair:%s' % B.CORAL, 'plant'],
             ['parasol:%s:%s' % (B.TURQ, B.WHITE), 'plant', 'towel:%s:0.3' % B.CORAL],
             ['parasol:%s:%s' % (B.LEMON, B.WHITE), 'chair:%s' % B.MINT, 'towel:%s:-0.3' % B.AQUA],
             ['towel:%s:0.3' % B.MINT, 'chair:%s' % B.LEMON, 'plant'],
             ['parasol:%s:%s' % (B.PINK, B.WHITE), 'plant', 'towel:%s:-0.32' % B.SKY]]
    bal_pts = []
    HALF = 0.62
    for f in range(NF):
        zf = Z1 + f * ST
        outer = (f % 2 == 0)
        for k, xc in enumerate(wing_c):
            h = -1 if k == 0 else 1                     # outer side of this wing
            bx_ = xc + h * HALF if outer else xc - h * HALF
            wx_ = xc - h * HALF if outer else xc + h * HALF
            g, stand = B.balcony('bal%d_%d' % (f, k), (bx_, y0, zf + 0.02), 'y-', w=1.12, depth=0.62,
                                 items=items[(2 * f + k) % len(items)], seed=f * 2 + k)
            B.gwin('bd%d_%d' % (f, k), (bx_, y0, zf + 0.06), 'y-', w=0.5, h=0.94, sill=None,
                   curtain=curtains[(f * 3 + k * 2) % 8], lit=rnd.random() > 0.2)
            B.gwin('bw%d_%d' % (f, k), (wx_, y0, zf + 0.42), 'y-', w=0.5, h=0.62, shutters=B.TURQ,
                   curtain=curtains[(f * 3 + k * 2 + 3) % 8], lit=rnd.random() > 0.25)
            flower_box('bfb%d_%d' % (f, k), (wx_, y0, zf + 0.42), 'y-', w=0.62)
            bal_pts.append((B.face_to_local('y-', (bx_, y0, zf + 0.02), (stand[0], stand[1], 0.0)), (0, -1, 0), f))
    sw, sc, sl = wface(side, x0, x1, y0, y1)
    sg = along_sign(side)
    for f in range(NF):
        zf = Z1 + f * ST
        s_f = -1 if f % 2 == 0 else 1                  # front half on floors 0 / 2, back half on floor 1
        ub, uw = sc + sg * s_f * 0.82, sc - sg * s_f * 0.82
        g, stand = B.balcony('sbal%d' % f, on_face(side, sw, ub, zf + 0.02), side, w=1.3, depth=0.55,
                             items=items[(f + 3) % len(items)], seed=20 + f)
        for j, dx in enumerate((-0.3, 0.3)):
            B.gwin('sd%d_%d' % (f, j), on_face(side, sw, ub + sg * dx, zf + 0.06), side, w=0.4, h=0.92, sill=None,
                   curtain=curtains[(f + j * 3 + 1) % 8], lit=rnd.random() > 0.2)
        B.gwin('sw%d' % f, on_face(side, sw, uw, zf + 0.42), side, w=0.5, h=0.6, shutters=B.TURQ,
               curtain=curtains[(f + 4) % 8], lit=rnd.random() > 0.3)
        flower_box('sfb%d' % f, on_face(side, sw, uw, zf + 0.42), side, w=0.62)
        bal_pts.append((B.face_to_local(side, on_face(side, sw, ub, zf + 0.02), (stand[0], stand[1], 0.0)),
                        out_dir(side), f))
    # dormers on the front slope of each wing (+ chimneys on the back slope, gulls on the ridge)
    for k, xc in enumerate(wing_c):
        yf = y0 + 0.3
        B.dormer('dorm%d' % k, xc, yf, roof_z(xc, yf) - 0.32, w=0.78, h=0.72, depth=0.9, curtain=curtains[k + 2])
    for k, cx_ in enumerate((x0 + 0.9,)):
        cy_ = BY + 0.55
        z0 = roof_z(cx_, cy_) - 0.3
        box('chim%d' % k, (0.36, 0.36, 0.95), (cx_, cy_, z0), mat=B.stucco(WALL, var=0.03), bevel=0.03)
        box('chimc%d' % k, (0.46, 0.46, 0.07), (cx_, cy_, z0 + 0.95), mat=flat(B.TERRA, 0.6), bevel=0.02)
        for s in (-1, 1):
            box('chimt%d' % k, (0.14, 0.42, 0.14), (cx_ + s * 0.12, cy_, z0 + 1.02), mat=flat(B.TERRA, 0.6),
                bevel=0.03)
        box('chimh%d' % k, (0.1, 0.24, 0.02), (cx_, cy_, z0 + 1.03), mat=flat('#3A302A', 0.9), bevel=0.0)
    ridge_y = BY
    H.gull('gull0', (x0 + 1.55, ridge_y, ZT + RISE + 0.06), rz=-120.0, s=1.25)
    H.gull('gull1', (x1 - 1.85, ridge_y, ZT + RISE + 0.06), rz=-60.0, s=1.25)
    # ---- ground floor: warm-lit lobby (arched windows + glass doors), awnings, flower planters
    LOB_T, LOB_B = '#FFF3D9', '#FFCB8E'
    for k, xc in enumerate(wing_c):
        for j, dx in enumerate((-0.55, 0.55)):
            B.gwin('lw%d_%d' % (k, j), (xc + dx, y0 - 0.03, PL + 0.32), 'y-', w=0.66, h=1.0, arch=True,
                   curtain=None, strength=2.6, glass_top=LOB_T, glass_bot=LOB_B)
        B.awning_at('lawn%d' % k, 'y-', (xc, y0 - 0.03, PL + 1.38), wing_w - 0.35, 0.5, 0.22, -0.05, B.CORAL,
                    B.WHITE, n=10)
        # long flower planter under the lobby windows
        box('lplant%d' % k, (wing_w - 0.5, 0.3, 0.3), (xc, y0 - 0.2, 0.0), mat=B.stucco('#F1E3CC', var=0.03),
            bevel=0.03)
        for j in range(9):
            u = xc - (wing_w - 0.7) / 2 + (wing_w - 0.7) * j / 8
            sphere('lpl%d' % k, 0.13, (u, y0 - 0.2, 0.36), flat(B.LEAF if j % 2 else '#58B36B', 0.8),
                   scale=(1.1, 1.0, 0.8), segs=10, rings=6)
            sphere('lpf%d' % k, 0.05, (u + 0.03, y0 - 0.3, 0.44), flat((B.PINK, B.LEMON, B.CORAL, B.WHITE)[j % 4],
                                                                        0.5), segs=8, rings=6)
    B.glass_door('door', (BX, yt, PL - 0.02), 'y-', w=1.0, h=1.42, frame='#E7DED0', glass_top=LOB_T,
                 glass_bot=LOB_B)
    tr = T.ext_xz('transom', PA.arch_pts(0.86, 0.3, 10), 0.06, B.glass_mat('transom_g', LOB_T, LOB_B, strength=2.4),
                  y=yt - 0.01)
    tr.location = (BX, yt - 0.01, PL + 1.45)
    for s in (-1, 1):
        T.lamp_wall('dlamp%d' % (s > 0), (BX + s * 0.74, yt, PL + 1.2), 'y-', strength=2.5)
        B.light_pt((BX + s * 0.74, yt - 0.24, PL + 1.15), 'lamp', 0.7)
    # entrance canopy on two columns: coral-striped canvas top, turquoise fascia, gold stars, flower planters on top
    cz = Z1 - 0.12
    cy0 = y0 - 1.6
    ctop = L.stripes(B.CORAL, '#FFF8F0', 1.0 / 0.22, 'X', rough=0.75, soft=0.04)
    B.canopy_flat('canopy', BX - 1.3, BX + 1.3, cy0, yt, cz, col=WHITE_T, edge=B.TURQ,
                  posts=[(BX - 1.18, cy0 + 0.14), (BX + 1.18, cy0 + 0.14)], post_col=WHITE_T, top=ctop)
    for k in range(5):
        st = T.ext_xz('cstar%d' % k, T.star_pts(0.1, 0.045), 0.03, flat(B.GOLD, 0.3, 0.8), y=cy0 - 0.02)
        st.location = (BX - 0.52 + 0.26 * k, cy0 - 0.02, cz + 0.07)
    for s in (-1, 1):                          # planter boxes on the canopy corners
        px_ = BX + s * 1.0
        box('cpl%d' % (s > 0), (0.5, 0.26, 0.18), (px_, cy0 + 0.2, cz + 0.12), mat=flat(WHITE_T, 0.6), bevel=0.02)
        for j in range(4):
            sphere('cplf%d' % (s > 0), 0.1, (px_ - 0.18 + 0.12 * j, cy0 + 0.2, cz + 0.36), flat(B.LEAF, 0.8),
                   scale=(1, 1, 0.85), segs=10, rings=6)
            sphere('cplb%d' % (s > 0), 0.045, (px_ - 0.17 + 0.12 * j, cy0 + 0.13, cz + 0.42),
                   flat((B.PINK, B.CORAL, B.LEMON, B.WHITE)[j], 0.5), segs=8, rings=6)
    box('cpave', (2.5, abs(cy0 - yt) + 0.2, 0.03), (BX, (cy0 + yt) / 2, 0.0),
        mat=B.tile_mat('#F7F1E6', '#EDE3D2', 3.0, '#D9CDB8'), bevel=0.01)
    box('carpet', (0.9, abs(cy0 - yt) + 0.55, 0.035), (BX, (cy0 + yt) / 2 - 0.18, 0.0), mat=flat('#C8333E', 0.8),
        bevel=0.01)
    for s in (-1, 1):
        box('cedge', (0.04, abs(cy0 - yt) + 0.55, 0.04), (BX + s * 0.45, (cy0 + yt) / 2 - 0.18, 0.0),
            mat=flat(B.GOLD, 0.3, 0.8), bevel=0.0)
    for s in (-1, 1):
        B.planter_palm('ppalm%d' % (s > 0), (BX + s * 1.62, y0 - 0.38, 0.0), h=1.5, s=0.62, seed=4 + s)
    # big palms at the front corners of the hotel
    B.palm('cpalmL', (x0 - 0.25, y0 - 0.45, 0.0), h=2.9, lean=(-0.3, -0.25), s=1.0, seed=31)
    pr_ = (x1 + 0.4, y0 - 0.15, 0.0) if side == 'x+' else (x1 + 0.2, y0 - 0.45, 0.0)
    B.palm('cpalmR', pr_, h=2.4, lean=(0.5, 0.42) if side == 'x+' else (0.45, -0.35), s=0.92, seed=32)
    for nm, pp_ in (('cpotL', (x0 - 0.25, y0 - 0.45, 0.0)), ('cpotR', pr_)):
        cyl(nm, 0.3, 0.22, pp_, mat=B.stucco('#F1E3CC', var=0.03), segs=20, bevel=0.03)
    # concierge desk (left, under the canopy) - the receptionist stands BEHIND it (front overlay)
    dx_, dy_ = BX - 0.78, y0 - 1.02
    with L.Collect() as dc:
        box('desk', (0.62, 0.36, 0.86), (dx_, dy_, 0.0), mat=tonal(B.WOOD_D, 0.06, 4.0), bevel=0.04)
        box('deskp', (0.5, 0.02, 0.6), (dx_, dy_ - 0.18, 0.12), mat=flat(B.TURQ, 0.5), bevel=0.01)
        box('desktop', (0.72, 0.44, 0.06), (dx_, dy_, 0.86), mat=flat('#F2E6CF', 0.4), bevel=0.02)
        box('deskstr', (0.72, 0.05, 0.05), (dx_, dy_ - 0.2, 0.8), mat=flat(B.GOLD, 0.3, 0.8), bevel=0.01)
        cyl('bellb', 0.07, 0.02, (dx_ + 0.18, dy_ - 0.06, 0.92), mat=flat(B.GOLD, 0.3, 0.8), segs=16)
        sphere('bell', 0.065, (dx_ + 0.18, dy_ - 0.06, 0.94), flat(B.GOLD, 0.25, 0.85), scale=(1, 1, 0.7), segs=14,
               rings=8)
        box('book', (0.26, 0.18, 0.03), (dx_ - 0.12, dy_ - 0.05, 0.92), rot=(0, 0, -8), mat=flat('#FBF6EA', 0.6),
            bevel=0.01)
        box('bookc', (0.28, 0.2, 0.02), (dx_ - 0.12, dy_ - 0.05, 0.91), rot=(0, 0, -8), mat=flat('#B0303A', 0.6),
            bevel=0.005)
    B.front(dc.objs)
    B.luggage_cart('cart', (BX + 2.25, y0 - 1.05, 0.0), rz=-12.0)
    # side face ground floor: service door, window, crates (supply pad = inPoint)
    sdu = sc + sg * 0.8
    T.door('sdoor', on_face(side, sw, sdu, PL), side, w=0.7, h=1.3, col=B.TURQ, frame_col=WHITE_T, glass=False,
           step_col='#D8CBB6')
    B.gwin('sgw', on_face(side, sw, sc - sg * 0.7, PL + 0.5), side, w=0.5, h=0.75, shutters=B.TURQ, curtain=B.MINT)
    o = out_dir(side)
    cpos = on_face(side, sw, sdu + sg * 0.75, 0.0)
    PA.crate_model('crate1', 0.42, loc=(cpos[0] + o[0] * 0.4, cpos[1] + o[1] * 0.4, 0.0), snow=False)
    PA.crate_model('crate2', 0.36, loc=(cpos[0] + o[0] * 0.4, cpos[1] + o[1] * 0.4, 0.42), rot=(0, 0, 18),
                   snow=False)
    # ---- rooftop marquee sign over the right wing (legs down into the roof), facing the camera
    sbx, sby = (x1 - wing_w / 2 + 0.15, BY + 0.35) if side == 'x+' else (x0 + wing_w / 2 - 0.15, BY + 0.35)
    sbz = ZT + 1.75
    a = math.radians(B.psi())
    for s in (-1, 1):
        p = (sbx + s * 0.85 * math.cos(a), sby + s * 0.85 * math.sin(a))
        cyl('sleg', 0.045, sbz - ZT - 0.3, (p[0], p[1], ZT), mat=flat('#9AA3AE', 0.4, 0.5), segs=8)
    B.sign_board('board', (sbx, sby, sbz), w=2.3, h=0.62, bg='#FFF8EC', frame=B.CORAL, bulbs=22)
    for k in range(5):
        u = (k - 2) * 0.32
        st = T.ext_xz('bstar%d' % k, T.star_pts(0.12 if k != 2 else 0.16, 0.055 if k != 2 else 0.07), 0.04,
                      flat(B.GOLD, 0.3, 0.8))
        g_ = L.group([st], 'bstarg%d' % k, loc=(sbx + u * math.cos(a), sby + u * math.sin(a),
                                                sbz + 0.47 + (0.06 if k == 2 else 0)), rot=(0, 0, B.psi()))
        B.glow_objs(g_, strength=0.6)
    B.light_pt((sbx, sby, sbz), 'sign', 1.6)
    # ---- markers
    mark('door', (BX, yt - 0.55, 0.0), facing=(0, 1, 0))
    # doorman: beside the carpet IN FRONT of the canopy (clear of the columns on screen), greeting arrivals
    mark('staff', (BX + 0.62, cy0 - 0.2, 0.0), facing=(-0.5, -1, 0))
    mark('staff', (BX + 2.8, y0 - 1.6, 0.0), facing=(-1, -0.6, 0))                   # bellhop
    mark('staff', (dx_ - 0.02, dy_ + 0.42, 0.0), facing=(0.2, -1, 0))                # receptionist (behind desk)
    for k in range(3):
        mark('customer', (dx_ + 0.05 + 0.1 * k, dy_ - 0.62 - 0.48 * k, 0.0), facing=(0, 1, 0))
    for p, fdir, f in bal_pts:
        mark('balcony', p, facing=fdir)
    ip = on_face(side, sw, sdu, 0.0)
    mark('in', (ip[0] + o[0] * 0.9, ip[1] + o[1] * 0.9, 0.0))
    for s in (-1, 1):
        B.light_pt((BX + s * 1.18, cy0 + 0.14, cz - 0.05), 'lamp', 0.8)
    for k, xc in enumerate(wing_c):
        B.light_pt((xc, y0 - 0.05, PL + 0.8), 'window', 1.1)
    floors = [f for _, _, f in bal_pts]
    head = []
    for p, _, f in bal_pts:                     # px from a balcony floor up to the next thing above it
        head.append(int(round((2 * ST if f + 2 < NF else ZT - (Z1 + f * ST)) * 55.4256)))
    return {'fx': {'boardCentre': (sbx, sby, sbz), 'flag': (BX, yt + TD / 2, DZ + 2.2),
                   'bell': (dx_ + 0.18, dy_ - 0.06, 0.98), 'domeTop': (BX, yt + TD / 2, DZ + 1.55),
                   'chimney0': (x0 + 0.9, BY + 0.55, roof_z(x0 + 0.9, BY + 0.55) + 0.85)},
            'extra': {'floors': 5, 'staffRoles': ['doorman', 'bellhop', 'receptionist'], 'balconyDepth': 'front',
                      'balconyFloors': floors, 'balconyHeadroomPx': head}}


@bbld('resort_hotel', 'building', 'bbld_hotel', fp=(8.0, 5.8), catcher=40.0, notes=HOTEL_NOTE, samples=28,
      ko='햇살 리조트 호텔', en='Sunny Resort Hotel', zone='hotel')
def b_resort_hotel():
    return hotel_builder()


variant_x('resort_hotel', hotel_builder)


# =========================================================================== HOTEL POOL

POOL_NOTE = ('Hotel pool deck (6.4 x 4.6 m): pale stone deck with a 3.6 x 2.2 m pool (white coping, turquoise tiled '
             'walls, a sun mosaic on the floor, a chrome ladder, little underwater lamps, a yellow-blue slide at the '
             'left end), loungers with towels and parasols along the back and the right, a towel shelf + lifebuoy + '
             'shower, two deck lamps, potted palms.  The sprite is the DECK: the visible water surface (waterPoly) is '
             'cut out (transparent), so the water is drawn UNDER it, exactly like the sea under the land: '
             'src/systems/Water.js (palette "pool", shore "quay", mask = waterPoly) at depth d - 0.5, or the baked '
             'fallback `hotel_pool_water` (opaque water + pool floor, 6 f loop) at d - 0.5.  People on the deck / in '
             'the water are drawn at d + 0.5 (swimmers ON the water plane at swimPoints, sunbathers on lyingPoints with '
             'the beachfolk sunbathe dir = lyingFeetDirs).  Night: hotel_pool_glow = lit pool + lamps.')

POOL = (-2.0, 1.6, -1.05, 1.15)         # x0, x1, y0, y1 of the pool opening
POOL_ZW = -0.12                         # water surface
POOL_ZF = -0.7                          # pool floor


def pool_builder():
    x0, x1, y0, y1 = POOL
    FX0, FX1, FY0, FY1 = -3.2, 3.2, -2.3, 2.3
    deck = B.tile_mat('#F3ECDF', '#EAE0CE', 2.2, '#D8CBB4')
    T_ = 0.14
    # deck slab = 4 pieces around the opening (top at z 0)
    for (a0, a1, b0, b1) in ((FX0, x0, FY0, FY1), (x1, FX1, FY0, FY1), (x0, x1, FY0, y0), (x0, x1, y1, FY1)):
        box('deck', (a1 - a0, b1 - b0, T_), ((a0 + a1) / 2, (b0 + b1) / 2, -T_ + 0.02), mat=deck, bevel=0.02)
    # coping (white rounded rim)
    cm = flat('#FBF8F2', 0.45)
    for (cx, cy, sx, sy) in (((x0 + x1) / 2, y0 - 0.08, x1 - x0 + 0.32, 0.16), ((x0 + x1) / 2, y1 + 0.08, x1 - x0 + 0.32,
                                                                             0.16),
                             (x0 - 0.08, (y0 + y1) / 2, 0.16, y1 - y0), (x1 + 0.08, (y0 + y1) / 2, 0.16, y1 - y0)):
        box('coping', (sx, sy, 0.06), (cx, cy, 0.0), mat=cm, bevel=0.025)
    # basin: walls + floor (tiled)
    wall_m = B.tile_mat('#9EE3EC', '#8AD8E4', 7.0, '#E9F9FB')
    floor_m = B.tile_mat('#B9EEF2', '#A8E6EE', 5.0, '#E9F9FB')
    depth = 0.02 - POOL_ZF
    box('pfloor', (x1 - x0, y1 - y0, 0.06), ((x0 + x1) / 2, (y0 + y1) / 2, POOL_ZF - 0.06), mat=floor_m, bevel=0.0)
    for (cx, cy, sx, sy) in (((x0 + x1) / 2, y0 + 0.03, x1 - x0, 0.06), ((x0 + x1) / 2, y1 - 0.03, x1 - x0, 0.06),
                             (x0 + 0.03, (y0 + y1) / 2, 0.06, y1 - y0), (x1 - 0.03, (y0 + y1) / 2, 0.06, y1 - y0)):
        box('pwall', (sx, sy, depth), (cx, cy, POOL_ZF), mat=wall_m, bevel=0.0)
    # dark-blue band at the waterline + lane / mosaic on the floor
    box('pband', (x1 - x0 - 0.02, 0.012, 0.06), ((x0 + x1) / 2, y1 - 0.065, POOL_ZW - 0.02), mat=flat('#2F86C9', 0.4),
        bevel=0.0)
    box('pband2', (0.012, y1 - y0 - 0.02, 0.06), (x0 + 0.065, (y0 + y1) / 2, POOL_ZW - 0.02), mat=flat('#2F86C9', 0.4),
        bevel=0.0)
    with L.Collect() as mc:
        B.em_sun(0.9, col='#F6D35B', ray='#F2B632', face=True)
    g = L.group(BA.top_level(mc.objs), 'mosaic', loc=(-0.5, 0.35, POOL_ZF + 0.005), rot=(-90, 0, 0))
    g.scale = (1.0, 0.12, 1.0)
    for k in range(3):
        box('lane', (0.9, 0.06, 0.008), (x0 + 0.6 + 1.2 * k, y0 + 0.35, POOL_ZF + 0.003), mat=flat('#2F86C9', 0.4),
            bevel=0.0)
    # ladder on the far wall (+Y) - goes under the water (the water overlay covers its lower half)
    lx = 0.75
    st = flat('#D7DEE6', 0.2, 0.9)
    mb = L.MB()
    for s in (-1, 1):
        x = lx + s * 0.2
        pts = [(x, y1 + 0.3, 0.0), (x, y1 + 0.3, 0.45), (x, y1 + 0.05, 0.6), (x, y1 - 0.12, 0.42), (x, y1 - 0.1, -0.5)]
        for p, q in zip(pts, pts[1:]):
            mb.seg(p, q, 0.025, st, segs=8)
    for k in range(3):
        mb.seg((lx - 0.2, y1 - 0.12, -0.02 - 0.17 * k), (lx + 0.2, y1 - 0.12, -0.02 - 0.17 * k), 0.018, st, segs=6)
    mb.done('ladder')
    # slide at the left end (sits on the deck beyond x0, chute ends on the coping)
    sx_, sy_ = x0 - 0.75, 0.45
    sm = flat(B.LEMON, 0.35)
    bm_ = flat('#3D8BE0', 0.35)
    for s in (-1, 1):
        cyl('sleg', 0.035, 1.25, (sx_ - 0.35, sy_ + s * 0.22, 0.0), mat=flat(B.STUCCO_W, 0.4), segs=8)
        cyl('sleg2', 0.035, 0.55, (sx_ + 0.25, sy_ + s * 0.22, 0.0), mat=flat(B.STUCCO_W, 0.4), segs=8)
    box('sstep', (0.3, 0.44, 0.05), (sx_ - 0.55, sy_, 0.4), mat=bm_, bevel=0.01)
    box('sstep2', (0.3, 0.44, 0.05), (sx_ - 0.55, sy_, 0.8), mat=bm_, bevel=0.01)
    box('splat', (0.36, 0.5, 0.08), (sx_ - 0.35, sy_, 1.22), mat=bm_, bevel=0.02)
    chute = []
    for k in range(9):
        t = k / 8
        chute.append((sx_ - 0.25 + t * 0.95, sy_, 1.28 - 1.05 * t + 0.25 * t * t))
    L.smooth_tube('chute', chute, 0.17, sm)
    for s in (-1, 1):
        L.smooth_tube('chuter', [(p[0], p[1] + s * 0.18, p[2] + 0.08) for p in chute], 0.035, bm_)
    # loungers + parasols along the back
    lie = []
    for k, (lx_, c, tw) in enumerate(((-1.85, B.AQUA, B.CORAL), (-0.75, B.CORAL, B.LEMON), (0.35, B.LEMON, B.TURQ),
                                      (1.45, B.AQUA, B.PINK))):
        B.lounger('lg%d' % k, (lx_, 1.75, 0.02), rz=90.0, col=c, towel=tw)
        lie.append((lx_, 1.75 - 0.06, 0.38))
    for k, (px_, c) in enumerate(((-1.3, B.CORAL), (0.9, B.TURQ))):
        B.parasol('ps%d' % k, (px_, 2.05, 0.02), r=0.85, h=1.95, c1=c, n=8)
    # right side: two loungers along Y heads toward +Y, a little side table with drinks
    for k, lx_ in enumerate((2.35, 2.95)):
        B.lounger('lr%d' % k, (lx_, 0.05, 0.02), rz=90.0, col=(B.MINT, B.PINK)[k], towel=(B.SKY, B.LEMON)[k])
        lie.append((lx_, 0.05 - 0.06, 0.38))
    cyl('stab', 0.16, 0.04, (2.65, -0.95, 0.42), mat=flat(B.STUCCO_W, 0.4), segs=18)
    cyl('stabl', 0.02, 0.42, (2.65, -0.95, 0.02), mat=flat(B.STUCCO_W, 0.4), segs=8)
    for k in range(2):
        with L.Collect() as dcc:
            B.em_cocktail(0.18, drink=B.CORAL)
        L.group(BA.top_level(dcc.objs), 'drink%d' % k, loc=(2.6 + 0.1 * k, -0.98 - 0.05 * k, 0.52))
    # left: towel shelf, lifebuoy post, outdoor shower
    tx_ = -2.85
    wm_ = tonal(B.WOOD, 0.06, 4.0)
    for s in (-1, 1):
        box('shelfs', (0.42, 0.05, 1.0), (tx_, -1.25 + s * 0.4, 0.02), mat=wm_, bevel=0.015)
    for j in range(4):
        box('shelfb', (0.42, 0.85, 0.04), (tx_, -1.25, 0.04 + 0.32 * j), mat=wm_, bevel=0.01)
    for j in range(3):
        for k, c in enumerate((B.CORAL, B.WHITE, B.AQUA, B.LEMON)):
            cyl('tw', 0.075, 0.36, (tx_ + 0.18, -1.52 + 0.18 * k, 0.16 + 0.32 * j), rot=(0, -90, 0),
                mat=L.stripes(c, B.WHITE if c != B.WHITE else B.AQUA, 22.0, 'Z', soft=0.05), segs=14, bevel=0.02,
                origin='center')
    cyl('lbpost', 0.04, 1.3, (tx_ + 0.05, 1.2, 0.02), mat=flat(B.STUCCO_W, 0.4), segs=8)
    H.life_ring('lbuoy', (tx_ + 0.05, 1.2 - 0.06, 0.95), rz=0.0)
    cyl('shpost', 0.04, 2.0, (tx_ + 0.15, 2.0, 0.02), mat=flat('#D7DEE6', 0.2, 0.9), segs=10)
    box('sharm', (0.04, 0.04, 0.32), (tx_ + 0.15, 2.0 - 0.0, 1.98), rot=(90, 0, 0), mat=flat('#D7DEE6', 0.2, 0.9),
        bevel=0.0)
    cyl('shhead', 0.1, 0.05, (tx_ + 0.15, 2.0 - 0.32, 1.9), mat=flat('#D7DEE6', 0.2, 0.9), segs=14)
    box('shgrate', (0.6, 0.6, 0.04), (tx_ + 0.15, 1.75, 0.02), mat=tonal(B.WOOD, 0.06, 4.0), bevel=0.01)
    # palms + hedge planters on the back / left edges
    B.planter_palm('pp1', (FX0 + 0.35, FY1 - 0.35, 0.02), h=1.7, s=0.7, seed=3)
    B.planter_palm('pp2', (FX1 - 0.4, FY1 - 0.35, 0.02), h=1.5, s=0.65, seed=8)
    for k in range(3):
        box('hedgebox', (1.2, 0.3, 0.28), (-1.6 + 1.6 * k, FY1 - 0.05, 0.02), mat=tonal(B.WOOD_D, 0.06, 4.0), bevel=0.03)
        for j in range(4):
            sphere('hedge', 0.17, (-2.05 + 1.6 * k + 0.3 * j, FY1 - 0.05, 0.42), flat(B.LEAF, 0.8),
                   scale=(1.1, 0.9, 0.85), segs=12, rings=8)
    # flat things on the front deck: a striped towel + flip-flops + an inflatable ring lying on the deck
    box('ftowel', (0.9, 0.5, 0.012), (-0.6, -1.75, 0.02), rot=(0, 0, 8),
        mat=L.stripes(B.PINK, B.WHITE, 9.0, 'X', soft=0.02), bevel=0.004)
    H.torus('fring', 0.24, 0.085, (0.7, -1.7, 0.1), mats=[flat(B.LEMON, 0.45), flat(B.WHITE, 0.5)],
            seg_fn=lambda j: (j // 4) % 2, M=28, K=10)
    for k in range(2):
        box('flip', (0.12, 0.26, 0.025), (-1.55 + 0.15 * k, -1.85, 0.02), rot=(0, 0, 10 * k), mat=flat(B.CORAL, 0.5),
            bevel=0.01)
    # underwater lamps on the two far walls (seen through the water; lit at night) + two deck lamps
    plm = B.neon_mat('poollamp', '#C9F7FF', 0.5, 4.5)
    for k, (px_, py_, rz_) in enumerate(((-1.25, y1 - 0.065, 0.0), (0.05, y1 - 0.065, 0.0),
                                         (x0 + 0.065, 0.05, 90.0))):
        cyl('plamp%d' % k, 0.075, 0.025, (px_, py_, -0.45), rot=(90, 0, rz_), mat=plm, segs=16, origin='center')
        B.light_pt((px_, py_, -0.4), 'pool', 1.0)
    B.lamp_post('dlampA', (3.0, 1.15, 0.02), h=1.9)
    B.lamp_post('dlampB', (-3.0, -0.35, 0.02), h=1.9)
    # water surface (hidden in the idle frame, animated in the water frames)
    wmats = {}
    wat = box('water', (x1 - x0, y1 - y0, 0.004), ((x0 + x1) / 2, (y0 + y1) / 2, POOL_ZW - 0.004),
              mat=B.water_mat('pw0', 0.0), bevel=0.0)
    NFR = 6

    def set_water(i):
        if i not in wmats:
            wmats[i] = B.water_mat('pw%d' % i, i / NFR)
        wat.data.materials.clear()
        wat.data.materials.append(wmats[i])
    # markers
    for (sx, sy) in ((-1.1, 0.2), (0.0, -0.35), (0.9, 0.45), (-0.4, 0.65), (1.1, -0.45)):
        mark('swim', (sx, sy, POOL_ZW), facing=(1, 0.3, 0))
    for k, p in enumerate(lie):
        # hips ON the cushion (beachfolk sunbathe anchor), head end = top of the backrest (+Y), feet end = foot of
        # the bed; lyingDirs = head direction (like assets/beach), the sunbathe dir = feet direction
        mark('lie', p, facing=(0, 1, 0))
        mark('liehead', (p[0], p[1] + 0.57, 0.52))
        mark('liefeet', (p[0], p[1] - 0.47, 0.38))
    mark('staff', (-2.45, -1.75, 0.0), facing=(1, 0.2, 0))
    for p in ((-2.6, 0.05), (2.95, 1.35), (1.9, -1.75)):
        mark('customer', (p[0], p[1], 0.0), facing=(0, 1, 0))
    return {'water': {'objs': [wat], 'rect': POOL, 'z': POOL_ZW, 'frames': NFR, 'set': set_water, 'fps': 6},
            'holes': [(x0, x1, y0, y1)],
            'fx': {'slideEnd': (x0 + 0.1, sy_, 0.12), 'shower': (tx_ + 0.15, 2.0 - 0.32, 1.85),
                   'poolCentre': ((x0 + x1) / 2, (y0 + y1) / 2, POOL_ZW)},
            'extra': {'waterZ': POOL_ZW, 'waterPalette': 'pool', 'waterShore': 'quay', 'lyingAxis': 'y',
                      'lyingHeightM': 0.38}}


@bbld('hotel_pool', 'building', 'bbld_hotel', fp=(6.4, 4.6), catcher=30.0, notes=POOL_NOTE, samples=28,
      ko='호텔 수영장', en='Hotel pool', zone='hotel')
def b_hotel_pool():
    return pool_builder()


# =========================================================================== BEACH CAFE

CAFE_NOTE = ('Beach cafe "파도 카페" (4.4 x 3.6 m): white-washed plank cafe with a turquoise roof, a big iced-coffee '
             'sign on the roof, a walk-up service window under a coral-white scalloped awning (the barista stands '
             'INSIDE behind the counter: staffPoints[0], draw beach_cafe_front above her), a menu board, a surfboard, '
             'party bulbs along the eaves and a wooden terrace with two parasol tables and bistro chairs on the '
             'visible side (seatPoints).  customerPoints = the queue at the window; doorPoint = the door.')


def bistro_chair(name, loc, rz, col=B.WOOD):
    wm = tonal(col, 0.06, 4.0)
    parts = [box(name + '_s', (0.36, 0.36, 0.05), (0, 0, 0.42), mat=wm, bevel=0.02),
             box(name + '_b', (0.36, 0.05, 0.36), (0, 0.16, 0.47), mat=wm, bevel=0.02)]
    for lx in (-0.14, 0.14):
        for ly in (-0.14, 0.14):
            parts.append(cyl(name + '_l', 0.02, 0.42, (lx, ly, 0), mat=flat('#E9E4DA', 0.4), segs=6))
    return L.group(parts, name, loc=loc, rot=(0, 0, rz))


def table_parasol(name, x, y, c1, top=B.WHITE, chairs=((-0.5, 0.0, -90), (0.0, 0.5, 180)), z=0.0, ccol=B.WOOD):
    cyl(name + '_leg', 0.035, 0.68, (x, y, z), mat=flat('#E9E4DA', 0.4), segs=10)
    cyl(name + '_foot', 0.16, 0.04, (x, y, z), mat=flat('#E9E4DA', 0.4), segs=16)
    cyl(name + '_top', 0.32, 0.05, (x, y, z + 0.68), mat=flat(top, 0.5), segs=28, bevel=0.015)
    B.parasol(name + '_ps', (x, y, z + 0.73), r=0.78, h=1.25, c1=c1, n=8, base=False)
    seats = []
    for j, (dx, dy, rz) in enumerate(chairs):
        bistro_chair('%s_ch%d' % (name, j), (x + dx, y + dy, z), rz, ccol)
        seats.append((x + dx, y + dy, rz))
    with L.Collect() as dc:
        B.em_iced(0.2)
    L.group(BA.top_level(dc.objs), name + '_cup', loc=(x - 0.08, y - 0.05, z + 0.82))
    return seats


def cafe_builder():
    side = side_faces()
    sgn = 1.0 if side == 'x+' else -1.0
    BX, BY, W, D = -0.65 * sgn, 0.55, 2.7, 2.2
    x0, x1, y0, y1 = BX - W / 2, BX + W / 2, BY - D / 2, BY + D / 2
    PL, WH = 0.16, 2.0
    wm = L.stripes('#F7F3EC', '#E8E2D6', 1.0 / 0.2, 'Z', rough=0.8, soft=0.05)
    T.plinth('plinth', W, D, h=PL, col='#CDBFA6', x=BX, y=BY)
    # front wall with the service window opening ; rest of the shell
    HX0, HX1, HZ0, HZ1 = BX - 1.05, BX + 0.15, PL + 0.85, PL + 1.75
    if sgn < 0:
        HX0, HX1 = BX - 0.15, BX + 1.05
    wall_open('fwall', x0, x1, y0, PL, PL + WH, (HX0, HX1, HZ0, HZ1), wm)
    box('bwall', (W, 0.12, WH), (BX, y1 - 0.06, PL), mat=wm, bevel=0.02)
    for s in (-1, 1):
        box('swall', (0.12, D - 0.24, WH), (BX + s * (W / 2 - 0.06), BY, PL), mat=wm, bevel=0.02)
    box('floor', (W - 0.2, D - 0.2, 0.04), (BX, BY, PL), mat=flat('#D9C4A0', 0.8), bevel=0.0)
    T.corner_trims('ctrim', W, D, PL, WH, B.TURQ, t=0.12, x=BX, y=BY)
    # interior seen through the window: warm back wall, shelves with cups, coffee machine, pendant lamps
    box('iback', (W - 0.3, 0.06, WH - 0.1), (BX, y1 - 0.16, PL), mat=T.glow_mat('iglow', 0.8, '#FFE6C0'), bevel=0.0)
    wx = (HX0 + HX1) / 2
    for k in range(2):
        box('ishelf', (1.2, 0.22, 0.04), (wx, y1 - 0.3, PL + 1.15 + 0.32 * k), mat=tonal(B.WOOD, 0.06, 4.0),
            bevel=0.01)
        for j in range(6):
            c = (B.CORAL, B.MINT, B.LEMON, B.WHITE, B.SKY, B.PINK)[(j + k) % 6]
            cyl('icup', 0.045, 0.12, (wx - 0.5 + 0.2 * j, y1 - 0.3, PL + 1.19 + 0.32 * k), mat=flat(c, 0.4), segs=10)
    box('icounter', (W - 0.3, 0.5, 0.9), (BX, y1 - 0.45, PL), mat=tonal(B.WOOD, 0.06, 4.0), bevel=0.02)
    box('imach', (0.5, 0.36, 0.5), (wx + 0.3, y1 - 0.4, PL + 0.9), mat=flat('#C9CED6', 0.3, 0.7), bevel=0.04)
    ilm = B.neon_mat('ilamp', '#FFE6A8', 1.5, 3.0)
    for k in range(2):
        cyl('ipend', 0.1, 0.12, (wx - 0.3 + 0.6 * k, BY - 0.1, PL + 1.7), mat=ilm, segs=14, r_top=0.04)
    L.point_light('iL', (wx, BY - 0.3, PL + 1.5), 'window', 25.0, 0.3)
    # warm-lit lining on the inner face of the side wall the camera sees through the service window (camera looks
    # along (-1, +1) at yaw 0 -> the left wall; the _x build sees the right one) + a cup shelf on it
    lx_ = x0 + 0.135 if sgn > 0 else x1 - 0.135
    box('ilin', (0.02, D - 0.4, WH - 0.15), (lx_, BY - 0.05, PL + 0.05), mat=T.glow_mat('ilinm', 0.7, '#FFE6C0'),
        bevel=0.0)
    for k in range(2):
        box('ilsh%d' % k, (0.16, 1.1, 0.035), (lx_ + 0.08 * sgn, BY - 0.25, PL + 1.2 + 0.3 * k),
            mat=tonal(B.WOOD, 0.06, 4.0), bevel=0.01)
        for j in range(5):
            c = (B.CORAL, B.MINT, B.LEMON, B.SKY, B.PINK)[(j + k) % 5]
            cyl('ilcup%d' % k, 0.045, 0.11, (lx_ + 0.08 * sgn, BY - 0.7 + 0.22 * j, PL + 1.235 + 0.3 * k),
                mat=flat(c, 0.4), segs=10)
    # service counter at the opening with iced drinks
    box('scount', (HX1 - HX0 + 0.2, 0.42, 0.08), (wx, y0 - 0.1, HZ0 - 0.04), mat=flat(B.STUCCO_W, 0.5), bevel=0.02)
    box('scbase', (HX1 - HX0 + 0.1, 0.06, HZ0 - PL - 0.1), (wx, y0 - 0.02, PL), mat=flat(B.CORAL, 0.6), bevel=0.02)
    for k in range(3):
        c = (B.CORAL, '#C98A5A', B.MINT)[k]
        cyl('scup', 0.05, 0.14, (wx - 0.3 + 0.28 * k, y0 - 0.18, HZ0 + 0.04), mat=flat('#F2FBFF', 0.15), segs=12,
            r_top=0.06)
        cyl('scupd', 0.045, 0.1, (wx - 0.3 + 0.28 * k, y0 - 0.18, HZ0 + 0.045), mat=flat(c, 0.4), segs=12,
            r_top=0.055)
    B.awning_at('wawn', 'y-', (wx, y0, HZ1 + 0.28), HX1 - HX0 + 0.4, 0.62, 0.0, -0.32, B.CORAL, B.WHITE, n=8)
    # door on the other part of the front
    dxp = BX + 0.85 * sgn
    T.door('door', (dxp, y0, PL), 'y-', w=0.64, h=1.4, col=B.TURQ, frame_col=B.STUCCO_W, glass=True,
           step_col='#CDBFA6', step_depth=0.3)
    T.lamp_wall('dlamp', (dxp + 0.48 * sgn, y0, PL + 1.3), 'y-', strength=2.0)
    # gable roof (ridge along X) turquoise, party bulbs along the front eave
    ridge = PL + WH + 0.95
    T.gable('roof', W, D, PL + WH, ridge, 0.32, B.TURQ, T.plaster('#F7F3EC'), x=BX, y=BY, snow_frac=(0, 0))
    eave_z = PL + WH - 0.32 * (0.95 / (D / 2))
    B.bulb_string('lights', (x0 - 0.2, y0 - 0.34, eave_z - 0.05), (x1 + 0.2, y0 - 0.34, eave_z - 0.05), n=11,
                  sag=0.16)
    # roof sign: big iced coffee on a round board facing the camera
    B.glow_objs(T.sign_disc('rsign', (BX + 0.15, BY + 0.05, ridge + 0.48), r=0.55, bg=B.MINT, rim=B.STUCCO_W,
                            emblem=lambda s: B.em_iced(s), es=0.95, psi=B.psi(), tilt=6.0, snow=False), strength=0.45)
    a = math.radians(B.psi())
    for s in (-1, 1):
        cyl('rsleg', 0.035, 0.55, (BX + 0.15 + s * 0.3 * math.cos(a), BY + 0.05 + s * 0.3 * math.sin(a),
                                   ridge - 0.2), mat=flat('#9AA3AE', 0.4, 0.5), segs=8)
    # terrace deck on the visible side with two parasol tables
    sw, sc, sl = wface(side, x0, x1, y0, y1)
    B.gwin('swin', on_face(side, sw, sc + 0.35 * along_sign(side), PL + 0.75), side, w=0.7, h=0.7, shutters=B.CORAL,
           curtain=B.LEMON)
    tx0, tx1 = (x1 + 0.05, 2.2) if sgn > 0 else (-2.2, x0 - 0.05)
    B.plank_floor('terr', tx0, tx1, -1.75, 1.7, z=0.03, t=0.07, along='y', seed=4)
    tcx = (tx0 + tx1) / 2
    seats = []
    seats += table_parasol('t1', tcx, -0.85, B.CORAL, chairs=((0.0, -0.5, 0), (0.45 * sgn, 0.1, 90 * sgn)))
    seats += table_parasol('t2', tcx, 0.75, B.TURQ, chairs=((0.0, -0.5, 0), (0.45 * sgn, 0.1, 90 * sgn)))
    for k in range(3):
        x = tx1 - 0.04 if sgn > 0 else tx0 + 0.04
        cyl('tpost', 0.03, 0.55, (x, -1.6 + 1.6 * k, 0.03), mat=tonal(B.WOOD_D, 0.06, 4.0), segs=8)
    B.rope_rail('trope', [(tx1 - 0.04 if sgn > 0 else tx0 + 0.04, -1.6 + 0.4 * k, 0.5 - 0.06 * math.sin(math.pi *
                                                                                                        (k % 4) / 4))
                          for k in range(9)])
    # menu board (A-frame), surfboard, potted palm, flower pot
    mbx, mby = (x0 - 0.25, y0 - 0.55) if sgn > 0 else (x1 + 0.25, y0 - 0.55)
    for s in (-1, 1):
        box('menu', (0.45, 0.04, 0.7), (mbx, mby + s * 0.08, 0.0), rot=(s * 12, 0, 0), mat=flat('#2F3B36', 0.8),
            bevel=0.015)
    box('menuf', (0.5, 0.2, 0.05), (mbx, mby, 0.66), mat=tonal(B.WOOD, 0.06, 4.0), bevel=0.015)
    for k in range(3):
        box('menul', (0.28 - 0.06 * k, 0.01, 0.025), (mbx, mby - 0.12, 0.5 - 0.12 * k), rot=(12, 0, 0),
            mat=flat((B.LEMON, B.WHITE, B.PINK)[k], 0.6), bevel=0.0)
    with L.Collect() as sb:
        B.em_surfboard(1.9, col=B.CORAL, stripe=B.WHITE)
    L.group(BA.top_level(sb.objs), 'surf', loc=(dxp + 0.62 * sgn, y0 - 0.1, 0.82), rot=(-8, 0, 0))
    B.planter_palm('cpalm', ((x1 if sgn > 0 else x0) + 0.3 * sgn, y1 + 0.1, 0.0), h=1.55, s=0.66, seed=12)
    B.pot_plant('cpot', (dxp - 0.5 * sgn, y0 - 0.3, 0.0), r=0.16, kind='flowers', seed=3)
    # markers
    # the barista stands on the camera's line of sight through the window centre (camera looks along (-1, +1) in
    # world space: for the base model that is -X, for the yaw-90 _x model +X), so the face shows in the opening
    mark('staff', (wx - 0.37 * sgn, y0 + 0.42, 0.0), facing=(0.1, -1, 0))
    for k in range(3):
        mark('customer', (wx - 0.05 * k, y0 - 0.62 - 0.46 * k, 0.0), facing=(0, 1, 0))
    mark('door', (dxp, y0 - 0.55, 0.0), facing=(0, 1, 0))
    for (cx, cy, rz) in seats:
        mark('seat', (cx, cy, 0.0), facing=(-math.sin(math.radians(rz)), -math.cos(math.radians(rz)), 0))
    mark('in', (mbx, mby - 0.75, 0.0))
    B.light_pt((wx, y0 - 0.3, HZ1 + 0.1), 'window', 0.9)
    B.light_pt((BX, y0 - 0.34, eave_z - 0.2), 'string', 1.6)
    B.light_pt((dxp + 0.48 * sgn, y0 - 0.25, PL + 1.2), 'lamp', 0.6)
    return {'fx': {'steam': (wx + 0.3, y1 - 0.4, PL + 1.5), 'sign': (BX + 0.15, BY + 0.05, ridge + 0.48)},
            'overlay_plane': True}


@bbld('beach_cafe', 'building', 'bbld_shops', fp=(4.4, 3.6), notes=CAFE_NOTE, ko='파도 카페', en='Beach cafe',
      zone='shops')
def b_beach_cafe():
    return cafe_builder()


variant_x('beach_cafe', cafe_builder)


# =========================================================================== ICE CREAM SHOP

ICE_NOTE = ('Ice-cream shop "구름 아이스크림" (3.4 x 3.2 m): candy-striped pink-and-white kiosk with a mint scalloped '
            'awning over a big service window (the vendor stands INSIDE behind a lit freezer counter of colourful '
            'tubs: staffPoints[0], draw icecream_shop_front above), a giant two-scoop cone with a cherry on the roof, '
            'sprinkle-dotted roof trim, a cone-shaped standing sign, a bench and a little table outside.  '
            'customerPoints = the kids\' queue in front of the window; seatPoints = bench.')


def icecream_builder():
    BX, BY, W, D = -0.2, 0.6, 2.4, 2.0
    x0, x1, y0, y1 = BX - W / 2, BX + W / 2, BY - D / 2, BY + D / 2
    PL, WH = 0.14, 2.05
    side = side_faces()
    wm = L.stripes('#F9C7D6', '#FFFFFF', 1.0 / 0.32, 'X', rough=0.7, soft=0.03)
    wm_y = L.stripes('#F9C7D6', '#FFFFFF', 1.0 / 0.32, 'Y', rough=0.7, soft=0.03)
    T.plinth('plinth', W, D, h=PL, col='#E3D3C2', x=BX, y=BY)
    # a low freezer (0.84 m) and a short, high awning: the vendor's face (~0.95 m on the chibi townsfolk) shows in
    # the opening between them
    HX0, HX1, HZ0, HZ1 = BX - 0.85, BX + 0.55, PL + 0.70, PL + 1.72
    wall_open('fwall', x0, x1, y0, PL, PL + WH, (HX0, HX1, HZ0, HZ1), wm)
    box('bwall', (W, 0.12, WH), (BX, y1 - 0.06, PL), mat=wm, bevel=0.02)
    for s in (-1, 1):
        box('swall', (0.12, D - 0.24, WH), (BX + s * (W / 2 - 0.06), BY, PL), mat=wm_y, bevel=0.02)
    box('floor', (W - 0.2, D - 0.2, 0.04), (BX, BY, PL), mat=flat('#E9DCC9', 0.8), bevel=0.0)
    T.corner_trims('ctrim', W, D, PL, WH, B.MINT, t=0.12, x=BX, y=BY)
    box('base', (W + 0.04, D + 0.04, 0.5), (BX, BY, PL), mat=flat('#F48FB1', 0.6), bevel=0.02)
    # interior: back wall menu of colourful flavour cards + cone rack
    box('iback', (W - 0.3, 0.06, WH - 0.1), (BX, y1 - 0.16, PL), mat=T.glow_mat('iglow', 0.9, '#FFE9C4'), bevel=0.0)
    for k in range(6):
        c = (B.PINK, B.MINT, B.LEMON, '#C98A5A', B.LILAC, B.CORAL)[k]
        box('icard', (0.22, 0.02, 0.22), (BX - 0.6 + 0.24 * k, y1 - 0.2, PL + 1.45), mat=flat(c, 0.6), bevel=0.01)
    L.point_light('iL', (BX - 0.2, BY - 0.2, PL + 1.6), 'window', 20.0, 0.3)
    # warm-lit lining + flavour cards on the inner side wall the camera sees through the window (see cafe_builder)
    sgn_ = 1.0 if side == 'x+' else -1.0
    lx_ = x0 + 0.135 if sgn_ > 0 else x1 - 0.135
    box('ilin', (0.02, D - 0.4, WH - 0.15), (lx_, BY - 0.05, PL + 0.05), mat=T.glow_mat('ilinm', 0.75, '#FFE9C8'),
        bevel=0.0)
    for k in range(4):
        c = (B.PINK, B.MINT, B.LEMON, B.LILAC)[k]
        box('ilcard%d' % k, (0.012, 0.2, 0.2), (lx_ + 0.012 * sgn_, BY - 0.55 + 0.26 * k, PL + 1.35 + 0.08 * (k % 2)),
            mat=flat(c, 0.6), bevel=0.0)
    # freezer counter at the opening: glass top showing tubs (lit)
    fc = (HX0 + HX1) / 2
    box('freezer', (HX1 - HX0 + 0.1, 0.55, HZ0 - PL - 0.02), (fc, y0 + 0.2, PL), mat=flat(B.STUCCO_W, 0.5), bevel=0.03)
    box('fzband', (HX1 - HX0 + 0.12, 0.57, 0.1), (fc, y0 + 0.2, PL + 0.3), mat=flat(B.MINT, 0.5), bevel=0.02)
    tubs = (B.PINK, B.MINT, '#C98A5A', B.LEMON, B.LILAC, '#F7F3EC')
    for k in range(6):
        cyl('tub', 0.09, 0.07, (fc - 0.55 + 0.22 * k, y0 + 0.08, HZ0 - 0.05), mat=flat(tubs[k], 0.7), segs=14,
            bevel=0.02)
        sphere('tubh', 0.07, (fc - 0.55 + 0.22 * k, y0 + 0.08, HZ0 + 0.0), flat(tubs[k], 0.7), scale=(1, 1, 0.55),
               segs=12, rings=6)
    box('fcount', (HX1 - HX0 + 0.2, 0.25, 0.06), (fc, y0 - 0.12, HZ0 - 0.06), mat=flat(B.MINT, 0.5), bevel=0.02)
    for k in range(4):
        with L.Collect() as cc:
            B.em_icecream(0.22, scoops=(tubs[k], tubs[(k + 2) % 6]), cherry=False)
        L.group(BA.top_level(cc.objs), 'ccone%d' % k, loc=(fc + 0.35 + 0.0 * k, y0 - 0.15 + 0.05 * k, HZ0 + 0.06),
                rot=(0, 0, 0)).scale = (0.5, 0.5, 0.5)
    B.awning_at('awn', 'y-', (fc, y0, HZ1 + 0.36), HX1 - HX0 + 0.5, 0.42, 0.0, -0.16, B.MINT, B.WHITE, n=9)
    # side door (visible side) + window
    sw, sc, sl = wface(side, x0, x1, y0, y1)
    T.door('door', on_face(side, sw, sc + along_sign(side) * 0.25, PL), side, w=0.62, h=1.35, col=B.MINT,
           frame_col=B.STUCCO_W, glass=True, step_col='#E3D3C2', step_depth=0.3)
    # flat roof with scalloped pink trim + sprinkles, giant cone on top
    RZ = PL + WH
    box('roof', (W + 0.24, D + 0.24, 0.16), (BX, BY, RZ), mat=flat('#FFF5F8', 0.6), bevel=0.04)
    rim = flat('#F48FB1', 0.55)
    n = 12
    for k in range(n):
        x = x0 - 0.12 + (W + 0.24) * (k + 0.5) / n
        sphere('scal', 0.1, (x, y0 - 0.13, RZ + 0.02), rim, scale=(1.05, 0.5, 0.8), segs=12, rings=8)
    for k in range(10):
        y = y0 - 0.12 + (D + 0.24) * (k + 0.5) / 10
        sphere('scal2', 0.1, (x1 + 0.13 if side == 'x+' else x0 - 0.13, y, RZ + 0.02), rim, scale=(0.5, 1.05, 0.8),
               segs=12, rings=8)
    rnd = L.rng(5)
    for k in range(26):
        sx = rnd.uniform(x0, x1)
        sy = rnd.uniform(y0, y1)
        box('spr', (0.1, 0.03, 0.03), (sx, sy, RZ + 0.16), rot=(0, 0, rnd.uniform(0, 180)),
            mat=flat((B.LEMON, B.TURQ, B.CORAL, B.LILAC, B.WHITE)[k % 5], 0.5), bevel=0.01)
    B.glow_objs(T.emblem_at('bigcone', lambda s: B.em_icecream(s, scoops=(B.PINK, B.MINT, '#F7F3EC')),
                            (BX + 0.1, BY + 0.1, RZ + 0.95), psi=B.psi(), scale=1.75, tilt=4.0), strength=0.45)
    # outside: bench, little table, cone-shaped sign
    T.town_bench('bench', (x1 + 0.55, BY - 0.25, 0.0), rot_z=90.0 if side == 'x+' else -90.0, col=B.MINT,
                 iron='#E9E4DA', snow=False)
    cyl('tb', 0.25, 0.04, (x0 - 0.35, y0 - 0.55, 0.62), mat=flat(B.WHITE, 0.4), segs=22)
    cyl('tbl', 0.03, 0.62, (x0 - 0.35, y0 - 0.55, 0.0), mat=flat('#E9E4DA', 0.4), segs=8)
    B.parasol('tps', (x0 - 0.35, y0 - 0.55, 0.66), r=0.62, h=1.1, c1=B.PINK, n=8, base=False)
    with L.Collect() as sc_:
        B.em_icecream(0.9, scoops=(B.LEMON, B.PINK, B.MINT))
    sg = L.group(BA.top_level(sc_.objs), 'standsign', loc=(BX + 0.95, y0 - 0.85, 0.75), rot=(0, 0, B.psi()))
    cyl('sspost', 0.03, 0.4, (BX + 0.95, y0 - 0.85, 0.0), mat=flat('#E9E4DA', 0.4), segs=8)
    cyl('ssfoot', 0.15, 0.05, (BX + 0.95, y0 - 0.85, 0.0), mat=flat('#E9E4DA', 0.4), segs=14)
    # markers
    # the vendor stands on the camera's line of sight through the window centre (see cafe_builder)
    sgn = 1.0 if side == 'x+' else -1.0
    mark('staff', (fc - 0.1 - 0.55 * sgn, y0 + 0.62, 0.0), facing=(0.1, -1, 0))
    for k in range(4):
        mark('customer', (fc + 0.05 - 0.06 * k, y0 - 0.65 - 0.42 * k, 0.0), facing=(0, 1, 0))
    dp = on_face(side, sw, sc + along_sign(side) * 0.25, 0.0)
    o = out_dir(side)
    mark('door', (dp[0] + o[0] * 0.55, dp[1] + o[1] * 0.55, 0.0), facing=(-o[0], -o[1], 0))
    for k in range(2):
        bp = (x1 + 0.55, BY - 0.25 + (k - 0.5) * 0.7) if side == 'x+' else (x0 - 0.55, BY - 0.25 + (k - 0.5) * 0.7)
        mark('seat', (bp[0], bp[1], 0.0), facing=(o[0], o[1], 0))
    mark('in', (x0 - 0.35, y0 - 0.75, 0.0))
    B.light_pt((fc, y0 - 0.2, HZ1), 'window', 0.9)
    return {'fx': {'cone': (BX + 0.1, BY + 0.1, RZ + 1.4), 'bell': (fc + 0.5, y0 - 0.1, HZ1 - 0.1)},
            'overlay_plane': True}


@bbld('icecream_shop', 'building', 'bbld_shops', fp=(3.4, 3.2), notes=ICE_NOTE, ko='구름 아이스크림',
      en='Ice-cream shop', zone='shops')
def b_icecream_shop():
    return icecream_builder()


variant_x('icecream_shop', icecream_builder)


try:                                   # the rest of the set
    import bbld_assets2  # noqa: E402,F401
except ImportError as _e:              # look-dev before bbld_assets2 exists
    if 'bbld_assets2' not in str(_e):
        raise
