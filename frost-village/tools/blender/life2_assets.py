"""
life2_assets.py - v5 life-event props (docs/CONTRACT_V5.md section P, design docs/기획서_v5_생활과미션.md §3-4):
weddings at the town hall, babies, the gentle farewell garden, school decor, and four new items.

Registry LIFE2 maps a build key to its builder + metadata (the same spec fields as bld_assets.bld, plus a Korean /
English name).  life2_render.py renders it (copy-extended from bld_render.render_build: same bl_common camera /
light / PPU / shadow catcher / frame fit) into /tmp/fv_cache/life2; life2_pack.py makes assets/life2/.

Conventions (as prop_assets / life_assets / town_assets)
  * 1 unit = 1 m, world origin = footprint centre = sprite anchor; builders model in a LOCAL frame whose front is
    -Y.  The render driver parents everything to a root empty rotated by `yaw`:
        yaw 0  -> front faces screen down-left (SW, world -Y)        yaw 45 -> front faces the camera (S)
        yaw 90 -> front faces screen down-right (SE, world +X)
  * Interaction markers: mark(kind, loc, facing) -> px offsets from the anchor (+ the screen facing of a character
    standing there).  Kinds -> manifest fields (life2_pack.POINTS):
        seat (seat-surface front centre, 0.45 m up, like the villager `sit` anchor) -> seatPoints / seatDirs
        seatg (the ground point under it)  -> seatGroundPoints        couple -> couplePoints / coupleDirs
        officiant -> officiantPoint / officiantDir                  aisle -> aislePoints (carpet walk start / end)
        serve -> servePoints / serveDirs (cake cutting)             stone -> stonePoints / stoneDirs
        gather -> gatherPoints / gatherDirs                         door -> doorPoint / doorDir
        path -> pathPoints                                          mourner -> mournerPoints / mournerDirs
        lay -> layPoint / layDir                                    wreath -> wreathPoint
        plaque -> plaquePoint (front face centre: the game may write a tiny name)    baby -> babyPoint
  * Nothing here is dark or scary: the farewell props are a flower garden with a blossom tree, a warm lantern,
    a bench, rounded pale stones with a gold heart and flowers - gentle and warm, like the rest of the village.

Not run directly - see life2_render.py.
"""
import math
from collections import OrderedDict

import bmesh
import bpy  # noqa: F401
from mathutils import Vector, Matrix

import prop_lib as L
from prop_lib import flat, snowy, tonal, box, cyl, sphere, blob
import prop_assets as PA
import life_assets as LA
import bld_assets as BA
import town_lib as T
import life2_lib as G

LIFE2 = OrderedDict()
MARKERS = []                       # (kind, empty, facing_local or None)

ITEM_FRAME = BA.ITEM_FRAME         # (72, 72)
ITEM_ANCHOR = BA.ITEM_ANCHOR       # (36, 54)
SEAT_Z = 0.45


def l2(key, kind, atlas, fp=None, yaw=0.0, shadow=True, samples=40, notes='', front=None, catcher=14.0,
       item=None, sprites=None, extra=None, ko=None, en=None, group=None):
    """Register a builder.  fp = footprint metres (a along local X, b along local Y) or ('r', radius)."""
    def deco(fn):
        ex = dict(extra or {})
        if ko or en:
            ex['name'] = {'ko': ko or key, 'en': en or key}
        LIFE2[key] = dict(key=key, fn=fn, kind=kind, atlas=atlas, fp=fp, yaw=yaw, shadow=shadow and not item,
                          samples=samples, notes=notes, front=front, catcher=catcher, item=item,
                          sprites=sprites, extra=ex, group=group or atlas)
        return fn
    return deco


def mark(kind, loc, facing=None, parent=None):
    em = bpy.data.objects.new('MK_%s_%d' % (kind, len(MARKERS)), None)
    bpy.context.scene.collection.objects.link(em)
    em.location = loc
    if parent is not None:
        em.parent = parent
    MARKERS.append((kind, em, None if facing is None else Vector(facing)))
    return em


def wmark(kind, world_xy, facing_world, yaw, z=0.0):
    """Marker given in WORLD coordinates for a build rendered at `yaw` (converted to the local frame)."""
    R = Matrix.Rotation(math.radians(-yaw), 3, 'Z')
    p = R @ Vector((world_xy[0], world_xy[1], z))
    f = None if facing_world is None else R @ Vector((facing_world[0], facing_world[1], 0.0))
    return mark(kind, tuple(p), facing=f)


def seat(x, y, z=SEAT_Z, facing=(0, -1, 0)):
    mark('seat', (x, y, z), facing=facing)
    mark('seatg', (x, y, 0.0), facing=facing)


def snow_bits(spots, seed=0):
    for k, (x, y, r) in enumerate(spots):
        LA.snow_drift('sd%d' % k, r, (x, y, 0.0), seed=seed + k, scale=(1.5, 1.0, 0.28))


WHITE_WOOD = '#F4EFE6'


def white_wood(rough=0.55):
    return tonal(WHITE_WOOD, 0.04, 5.0, rough=rough)


# =========================================================================== WEDDING ARCH

ARCH_NOTE = ('Wedding arch (2.3 x 0.6 m, ~2.6 m tall): white lattice arch on two flower planters, covered in pink / '
             'blush / white roses and greenery (heaviest at the top-left), pink + white satin ribbons hanging from the '
             'shoulders, a little gold heart hanging under the top, a touch of snow. Symmetric front / back, so guests '
             'on either side see flowers. couplePoints = bride + groom under the arch facing each other (E / W, '
             'profiles visible), officiantPoint = the chief behind them facing S (drawn behind the couple). '
             'Draw the couple / officiant above the arch sprite (depth "front").')


def build_arch(yaw):
    W2, PH, R = 0.92, 1.42, 0.92          # half span, post height (top of planter -> arc start), arc radius
    PZ = 0.3                               # planter height
    wood = white_wood()
    mb = G.MB()
    for sx in (-1, 1):
        x = sx * W2
        box('planter', (0.36, 0.36, PZ), (x, 0, 0), mat=wood, bevel=0.035)
        box('planter_rim', (0.4, 0.4, 0.05), (x, 0, PZ - 0.03), mat=wood, bevel=0.02)
        G.flower_mound(mb, (x, 0, PZ + 0.02), 0.2, 0.2, 0.12, G.WEDDING_COLS, n=14, seed=11 + sx, kind='rose',
                       fr=0.075)
        for y in (-0.1, 0.1):
            cyl('post', 0.04, PH, (x, y, PZ), mat=wood, segs=10, bevel=0.012)
        for k in range(5):
            z = PZ + 0.18 + k * 0.26
            box('rung', (0.045, 0.22, 0.03), (x, 0, z), mat=wood, bevel=0.01)
    # two arcs + rungs
    top = PZ + PH
    for y in (-0.1, 0.1):
        pts = [(R * math.cos(a), y, top + R * math.sin(a)) for a in [math.pi * k / 24 for k in range(25)]]
        L.tube('arc', pts, 0.04, wood, segs=8)
    for k in range(1, 12):
        a = math.pi * k / 12
        mb.seg((R * math.cos(a), -0.1, top + R * math.sin(a)), (R * math.cos(a), 0.1, top + R * math.sin(a)), 0.018,
               wood, segs=6)
    # flowers: chunky garland over the arc (thick at top-left, thinner on the right), clusters at the top and shoulders
    arc = lambda a0, a1, n: [(R * math.cos(a), 0.0, top + R * math.sin(a)) for a in
                             [math.radians(a0 + (a1 - a0) * k / n) for k in range(n + 1)]]
    G.garland(mb, arc(14, 182, 26), G.WEDDING_COLS, seed=3, r=0.12, step=0.055, flower_every=1, rose_r=0.075)
    G.garland(mb, [(-W2, 0.0, top + 0.05), (-W2 - 0.01, 0.0, top - 0.45), (-W2, 0.0, top - 0.85)], G.WEDDING_COLS,
              seed=20, r=0.1, step=0.055, flower_every=1, rose_r=0.07)
    G.garland(mb, [(W2, 0.0, top + 0.05), (W2 + 0.01, 0.0, top - 0.3)], G.WEDDING_COLS, seed=21, r=0.09, step=0.055,
              flower_every=2, rose_r=0.065)
    zc = top + R + 0.04
    G.flower_ball(mb, (-0.2, 0.0, zc), 0.26, G.WEDDING_COLS, n=26, seed=5, zmin=-0.55, leaves=12, rr=0.085,
                  squash=(1.35, 0.8, 0.85), filler=8)
    G.flower_ball(mb, (-R * 0.78, 0.0, top + R * 0.66), 0.22, G.WEDDING_COLS, n=20, seed=6, zmin=-0.65, leaves=10,
                  rr=0.08, squash=(1.0, 0.85, 1.05), filler=5)
    G.flower_ball(mb, (R * 0.82, 0.0, top + R * 0.55), 0.17, G.WEDDING_COLS, n=13, seed=7, zmin=-0.65, leaves=8,
                  rr=0.075, squash=(1.0, 0.85, 1.0), filler=4)
    G.flower_ball(mb, (-W2, 0.0, top - 0.95), 0.15, G.WEDDING_COLS, n=10, seed=8, zmin=-0.7, leaves=7, rr=0.07,
                  squash=(1.0, 0.85, 1.1), filler=3)
    # vines climbing the posts
    for sx in (-1, 1):
        pts = [(sx * W2 + 0.07 * math.cos(t * 2.4), 0.07 * math.sin(t * 2.4), PZ + 0.05 + t * 0.32)
               for t in [k * 0.25 for k in range(17)]]
        G.garland(mb, pts, (G.BLUSH, G.WHITE), seed=30 + sx, r=0.05, step=0.06, flower_every=5, filler=False)
    mb.done('flowers')
    # gold heart hanging under the top
    hm = flat(G.GOLD, 0.3, 0.6)
    pts = T.heart_pts(0.15, 40)
    T.ext_xz('heart', [(x, z) for x, z in pts], 0.035, hm, y=0.0175, bevel=0.012).location.z = top + R - 0.62
    L.tube('heart_str', [(0, 0, top + R - 0.47), (0, 0, top + R - 0.1)], 0.006, flat('#F4F1EA', 0.5))
    # ribbons from the shoulders
    pink, white = G.satin(G.RIBBON_PINK), G.satin(G.RIBBON_WHITE)
    for sx, m1, m2 in ((-1, pink, white), (1, white, pink)):
        a = math.radians(90 + sx * 62)
        p = Vector((R * math.cos(a), 0.0, top + R * math.sin(a)))
        G.bow('bow', tuple(p + Vector((0, -0.13, 0))), 0.11, m1, tails=0.0)
        G.bow('bowb', tuple(p + Vector((0, 0.13, 0))), 0.11, m1, rz=180.0, tails=0.0)
        for k, (m, dx, ln) in enumerate(((m1, 0.0, 1.05), (m2, 0.06, 0.85))):
            pts = G.tail_pts(tuple(p + Vector((sx * 0.02 + dx * sx, 0.0, -0.05))), ln, out=sx * 0.12, wave=0.025,
                             n=8, side=(1, 0, 0))
            G.strip('ribbon', pts, 0.055, m, normal=(0, -1, 0), thick=0.01, smooth_n=3)
    # snow on the top
    PA.snow_cap('snow1', 0.13, (-0.3, 0.02, zc + 0.26), 0.045, 3, scale=(1.6, 0.85, 1.0))
    PA.snow_cap('snow2', 0.09, (-R * 0.82, 0.0, top + R * 0.66 + 0.23), 0.035, 5)
    for sx in (-1, 1):
        LA.snow_drift('sd', 0.16, (sx * (W2 + 0.22), 0.1 * sx, 0.0), seed=40 + sx, scale=(1.4, 1.0, 0.35))
    # people: world-space positions (same for both orientations), see ARCH_NOTE
    s = math.sqrt(0.5)
    wmark('couple', (-0.27, -0.27), (s, s), yaw)          # bride / groom, screen-left, faces E
    wmark('couple', (0.27, 0.27), (-s, -s), yaw)          # screen-right, faces W
    wmark('officiant', (-0.66, 0.66), (s, -s), yaw)       # behind them (screen-up), faces S
    return {'fx': {'heart': (0, 0, top + R - 0.55), 'top': (0, 0, top + R + 0.25)}}


@l2('wedding_arch', 'decor', 'life2_wedding', fp=(2.3, 0.6), yaw=0.0, notes=ARCH_NOTE + ' Span along world X.',
    ko='결혼식 꽃 아치', en='Wedding arch', catcher=16.0, front='-Y')
def b_wedding_arch():
    return build_arch(0.0)


@l2('wedding_arch_y', 'decor', 'life2_wedding', fp=(2.3, 0.6), yaw=90.0, notes=ARCH_NOTE + ' Span along world Y.',
    ko='결혼식 꽃 아치(세로)', en='Wedding arch (Y)', catcher=16.0, front='+X')
def b_wedding_arch_y():
    return build_arch(90.0)


# =========================================================================== CARPET

CARPET_NOTE = ('Wedding aisle carpet (1.1 x 4.2 m, ground decal): rose-red runner with cream edges and gold lines, '
               'cream fringe at both ends, scattered pink / white petals and a little snow at the edges. Draw it on '
               'the ground layer (under every character). aislePoints[0] = walk start (local +Y end = toward the town '
               'hall), aislePoints[1] = end (at the arch); the couple walks start -> end (walk %s).')


def build_carpet():
    Wc, Lc = 1.1, 4.2
    red = tonal('#D4515F', 0.06, 3.0, rough=0.85)
    box('carpet', (Wc, Lc, 0.02), (0, 0, 0), mat=red, bevel=0.008)
    cream = flat('#F7EBD6', 0.8)
    gold = flat('#E9C46A', 0.5, 0.3)
    for sx in (-1, 1):
        box('edge', (0.06, Lc - 0.02, 0.006), (sx * (Wc / 2 - 0.035), 0, 0.02), mat=cream, bevel=0.002)
        box('gold', (0.025, Lc - 0.24, 0.005), (sx * (Wc / 2 - 0.13), 0, 0.02), mat=gold, bevel=0.001)
    for sy in (-1, 1):
        box('goldx', (Wc - 0.24, 0.025, 0.005), (0, sy * (Lc / 2 - 0.13), 0.02), mat=gold, bevel=0.001)
    mb = G.MB()
    for sy in (-1, 1):
        for k in range(16):
            x = -Wc / 2 + 0.05 + k * (Wc - 0.1) / 15
            mb.seg((x, sy * Lc / 2, 0.012), (x, sy * (Lc / 2 + 0.07), 0.008), 0.008, cream, segs=5)
    rnd = L.rng(8)
    pet = [flat(c, 0.6) for c in (G.PINK, G.WHITE, G.BLUSH, G.ROSE)]
    for k in range(150):
        on = k < 105
        x = rnd.uniform(-Wc / 2 + 0.05, Wc / 2 - 0.05) if on else rnd.choice((-1, 1)) * rnd.uniform(Wc / 2, Wc / 2 + 0.3)
        y = rnd.uniform(-Lc / 2 + 0.1, Lc / 2 - 0.1)
        mb.sphere(0.028, pet[k % 4], loc=(x, y, 0.026 if on else 0.006), rot=(rnd.uniform(-20, 20), 0,
                                                                              rnd.uniform(0, 180)),
                  scale=(1.0, 0.7, 0.22), segs=8, rings=5)
    mb.done('petals')
    snow_bits(((-0.7, 1.2, 0.14), (0.68, -0.6, 0.12), (-0.66, -1.7, 0.1), (0.7, 1.9, 0.12)), seed=50)
    mark('aisle', (0, Lc / 2 - 0.2, 0.0), facing=(0, -1, 0))
    mark('aisle', (0, -Lc / 2 + 0.25, 0.0), facing=(0, -1, 0))


@l2('wedding_carpet', 'decal', 'life2_wedding', fp=(1.1, 4.2), yaw=0.0, notes=CARPET_NOTE % 'SW (runs along world -Y)',
    ko='결혼식 카펫', en='Wedding carpet', catcher=12.0, front='-Y')
def b_wedding_carpet():
    build_carpet()


@l2('wedding_carpet_x', 'decal', 'life2_wedding', fp=(1.1, 4.2), yaw=90.0,
    notes=CARPET_NOTE % 'SE (runs along world +X)', ko='결혼식 카펫(가로)', en='Wedding carpet (X)', catcher=12.0,
    front='+X')
def b_wedding_carpet_x():
    build_carpet()


# =========================================================================== CHAIRS

CHAIR_NOTE = ('One row of three white wedding chairs (Chiavari style, blush cushions, a pink bow on every back, '
              'flower posies on the end chairs), 0.75 m apart (chibi heads are wide), seat 0.45 m, facing %s. Place '
              'rows behind each other (next row 1.05 m further from the arch) on both sides of the carpet. seatPoints = seat-surface front '
              'centre (villager / townsfolk `sit` anchor, 0.45 m up), seatGroundPoints = the ground under it, '
              'seatDirs = facing (sit_%s). seatDepth "front": draw sitters just above their row (row depth + 1, + dy '
              '* 0.001 for the order inside a row); the next row in front has a larger y and covers them.')


def chair(x, y=0.0, posy=0):
    wood = white_wood(0.5)
    cush = flat(G.BLUSH, 0.85)
    box('seat', (0.4, 0.38, 0.035), (x, y, 0.385), mat=wood, bevel=0.012)
    box('cush', (0.36, 0.34, 0.03), (x, y - 0.005, 0.42), mat=cush, bevel=0.012)
    for sx in (-1, 1):
        for sy in (-1, 1):
            cyl('leg', 0.021, 0.385, (x + sx * 0.17, y + sy * 0.16, 0), mat=wood, segs=8, bevel=0.005)
        cyl('bpost', 0.021, 0.56, (x + sx * 0.17, y + 0.17, 0.4), rot=(-5, 0, 0), mat=wood, segs=8, bevel=0.005)
    for zz in (0.58, 0.92):
        box('rail', (0.38, 0.035, 0.05), (x, y + 0.185 + (zz - 0.58) * 0.09, zz), rot=(-5, 0, 0), mat=wood,
            bevel=0.012)
    for dx in (-0.09, 0.0, 0.09):
        cyl('spindle', 0.012, 0.33, (x + dx, y + 0.19, 0.6), rot=(-5, 0, 0), mat=wood, segs=6, bevel=0.0)
    for dx in (-0.12, 0.0, 0.12):
        cyl('stretch', 0.01, 0.32, (x + dx, y - 0.16, 0.16), rot=(-90, 0, 0), mat=wood, segs=6, bevel=0.0)
    G.bow('bow', (x, y + 0.16, 0.92), 0.08, G.satin(G.RIBBON_PINK), tails=0.13, tail_out=0.025, tilt=-5)
    if posy:
        mb = G.MB()
        px = x + posy * 0.215
        G.flower_ball(mb, (px, y + 0.17, 0.74), 0.085, G.WEDDING_COLS, n=8, seed=60 + posy, zmin=-0.7, leaves=6,
                      rr=0.04)
        mb.done('posy')
        G.strip('posy_rib', G.tail_pts((px, y + 0.15, 0.68), 0.22, out=0.02 * posy, n=5), 0.03,
                G.satin(G.RIBBON_WHITE), normal=(posy, 0, 0), smooth_n=3)
    seat(x, y - 0.19)


def build_chairs():
    for k, x in enumerate((-0.75, 0.0, 0.75)):
        chair(x, 0.0, posy=(-1 if k == 0 else (1 if k == 2 else 0)))
    snow_bits(((-1.08, 0.25, 0.1), (1.1, -0.2, 0.09)), seed=70)


@l2('wedding_chairs', 'decor', 'life2_wedding', fp=(2.2, 0.55), yaw=0.0, notes=CHAIR_NOTE % ('SW (world -Y)', 'SE flipX'),
    ko='하객 의자', en='Wedding chairs', catcher=10.0, front='-Y')
def b_wedding_chairs():
    build_chairs()


@l2('wedding_chairs_x', 'decor', 'life2_wedding', fp=(2.2, 0.55), yaw=90.0, notes=CHAIR_NOTE % ('SE (world +X)', 'SE'),
    ko='하객 의자(가로)', en='Wedding chairs (X)', catcher=10.0, front='+X')
def b_wedding_chairs_x():
    build_chairs()


# =========================================================================== CAKE TABLE

CAKE_NOTE = ('Wedding cake table (r 0.55 m, ~1.45 m tall): round table in a white lace-hemmed cloth with pink ribbon '
             'swags and bows, a three-tier white cake with pink roses, pearl dots and a gold + pink heart topper, '
             'two strawberry cupcakes and a cake knife with a bow. Faces the camera. servePoints = where the couple '
             'stands behind the table to cut the cake (facing S); normal y-sorting draws them behind the table.')


@l2('wedding_cake_table', 'decor', 'life2_wedding', fp=('r', 0.56), yaw=45.0, notes=CAKE_NOTE,
    ko='웨딩 케이크 테이블', en='Wedding cake table', catcher=10.0, front='S')
def b_wedding_cake_table():
    cloth = tonal('#FBF7F0', 0.03, 6.0, rough=0.8)
    cyl('cloth', 0.56, 0.74, (0, 0, 0.0), mat=cloth, r_top=0.5, segs=40, bevel=0.03)
    cyl('top', 0.52, 0.025, (0, 0, 0.735), mat=cloth, segs=40, bevel=0.012)
    mb = G.MB()
    lace = flat('#FFFFFF', 0.7)
    for k in range(40):
        a = math.tau * k / 40
        mb.sphere(0.04, lace, loc=(0.565 * math.cos(a), 0.565 * math.sin(a), 0.045), scale=(1.0, 1.0, 0.7),
                  segs=8, rings=5)
    pink = G.satin(G.RIBBON_PINK)
    for k in range(6):                      # ribbon swags around the table edge
        a0, a1 = math.tau * k / 6, math.tau * (k + 1) / 6
        pts = []
        for j in range(9):
            a = a0 + (a1 - a0) * j / 8
            r = 0.51 + 0.02 * math.sin(math.pi * j / 8)
            pts.append((r * math.cos(a), r * math.sin(a), 0.7 - 0.13 * math.sin(math.pi * j / 8)))
        mid = (a0 + a1) / 2
        G.strip('swag', pts, 0.05, pink, normal=(math.cos(mid), math.sin(mid), 0.0), smooth_n=2)
        G.bow('tbow', (0.535 * math.cos(a0), 0.535 * math.sin(a0), 0.69), 0.065, pink, rz=math.degrees(a0) + 90,
              tails=0.12, tail_out=0.02)
    # cake
    cream = tonal('#FFF8EE', 0.03, 8.0, rough=0.6)
    z = 0.75
    tiers = ((0.22, 0.16), (0.16, 0.14), (0.105, 0.12))
    for k, (r, h) in enumerate(tiers):
        cyl('tier', r, h, (0, 0, z), mat=cream, segs=36, bevel=0.03)
        for j in range(int(r * 90)):
            a = math.tau * j / int(r * 90)
            mb.sphere(0.012, flat('#FFFFFF', 0.25), loc=(r * math.cos(a), r * math.sin(a), z + 0.012), segs=8, rings=5)
        n = 5 + 2 * (2 - k)
        for j in range(n):
            a = math.tau * j / n + k * 0.4
            G.rose(mb, (r * 0.9 * math.cos(a), r * 0.9 * math.sin(a), z + h + 0.008), 0.03, (G.PINK, G.ROSE,
                                                                                              G.BLUSH)[j % 3],
                   normal=(math.cos(a) * 0.5, math.sin(a) * 0.5, 1.0))
        z += h
    # rose cascade down the front-left
    for j in range(7):
        t = j / 6.0
        a = math.radians(-140 + 30 * t)
        r = 0.23 - 0.12 * t
        G.rose(mb, (r * math.cos(a), r * math.sin(a), 0.86 + 0.32 * t), 0.032, (G.ROSE, G.PINK, G.WHITE)[j % 3],
               normal=(math.cos(a), math.sin(a), 0.4))
        G.leaf(mb, ((r + 0.02) * math.cos(a + 0.2), (r + 0.02) * math.sin(a + 0.2), 0.84 + 0.32 * t), 0.035,
               G.LEAF, (math.cos(a + 0.3), math.sin(a + 0.3), 0.2))
    # topper: two hearts on sticks
    gold = flat(G.GOLD, 0.3, 0.6)
    for sx, col in ((-1, gold), (1, flat(G.ROSE, 0.4))):
        cyl('stick', 0.006, 0.14, (sx * 0.035, 0, z), mat=flat('#F4F1EA', 0.4), segs=6, bevel=0.0)
        o = T.ext_xz('topheart', T.heart_pts(0.05, 30), 0.016, col, y=0.008, bevel=0.005)
        o.location = (sx * 0.035, 0, z + 0.17)
        o.rotation_euler.z = math.radians(-45 + sx * 12)
    # cupcakes + knife
    for k, (x, y) in enumerate(((-0.3, -0.22), (-0.16, -0.36))):
        cyl('cup', 0.045, 0.05, (x, y, 0.75), mat=flat('#F28DB2', 0.6), r_top=0.055, segs=16, bevel=0.01)
        sphere('frost', 0.055, (x, y, 0.81), flat('#FFF1F4', 0.5), scale=(1, 1, 0.75), segs=14, rings=8)
        sphere('berry', 0.02, (x, y, 0.85), flat('#D9483B', 0.35), segs=10, rings=6)
    box('knife', (0.22, 0.03, 0.008), (0.28, -0.24, 0.755), rot=(0, 0, 30), mat=flat('#D6DDE6', 0.25, 0.8), bevel=0.003)
    box('handle', (0.08, 0.025, 0.02), (0.39, -0.18, 0.755), rot=(0, 0, 30), mat=flat('#F7F3EC', 0.4), bevel=0.006)
    G.bow('kbow', (0.355, -0.2, 0.775), 0.035, pink, rz=30, tails=0.0)
    mb.done('deco')
    snow_bits(((-0.62, 0.3, 0.1), (0.58, 0.35, 0.09)), seed=80)
    for sx in (-1, 1):
        mark('serve', (sx * 0.28, 0.72, 0.0), facing=(0, -1, 0))
    return {'fx': {'cakeTop': (0, 0, z + 0.2), 'cake': (0, 0, 1.0)}}


# =========================================================================== FLOWER STAND

STAND_NOTE = ('Flower stand (~1.4 m): white fluted pedestal with a round arrangement of pink / blush / white roses '
              'and trailing greenery, a pink bow on the column. Line the aisle with them, flank the arch and the '
              'town-hall steps. Faces the camera.')


@l2('flower_stand', 'decor', 'life2_wedding', fp=('r', 0.24), yaw=45.0, notes=STAND_NOTE, ko='꽃 장식대',
    en='Flower stand', catcher=8.0, front='S')
def b_flower_stand():
    wood = white_wood(0.45)
    cyl('base', 0.17, 0.07, (0, 0, 0), mat=wood, segs=24, bevel=0.02)
    cyl('base2', 0.12, 0.05, (0, 0, 0.07), mat=wood, segs=24, bevel=0.015)
    cyl('col', 0.07, 0.72, (0, 0, 0.11), mat=wood, segs=16, bevel=0.01)
    for z in (0.14, 0.8):
        cyl('ring', 0.085, 0.035, (0, 0, z), mat=wood, segs=20, bevel=0.01)
    cyl('plate', 0.15, 0.035, (0, 0, 0.83), mat=wood, segs=24, bevel=0.012)
    cyl('urn', 0.11, 0.13, (0, 0, 0.865), mat=wood, r_top=0.16, segs=24, bevel=0.015)
    mb = G.MB()
    G.flower_ball(mb, (0, 0, 1.12), 0.24, G.WEDDING_COLS, n=22, seed=90, zmin=-0.45, leaves=12, filler=8,
                  squash=(1.1, 1.1, 0.9))
    G.garland(mb, [(0.2, -0.05, 1.0), (0.26, -0.08, 0.85), (0.24, -0.06, 0.66), (0.2, -0.04, 0.52)], (G.WHITE,
                                                                                                  G.BLUSH),
              seed=91, r=0.045, step=0.05, flower_every=4, filler=False)
    mb.done('flowers')
    G.bow('bow', (0, -0.085, 0.62), 0.08, G.satin(G.RIBBON_PINK), tails=0.24, tail_out=0.03)
    PA.snow_cap('sn', 0.08, (-0.06, 0.05, 1.33), 0.03, 2)
    return {'fx': {'top': (0, 0, 1.38)}}


# =========================================================================== RIBBON GARLAND (town-hall front)

GARLAND_NOTE = ('Wedding dressing for the EXISTING town_hall (assets/town): flower-and-greenery swags along the '
                'portico entablature, pink bows with long tails at the column tops, pink + white ribbons spiralling '
                'down the two outer columns, pastel bunting from both flag poles to the portico corners, bows on the '
                'two street lamps and a heart wreath of roses on the door. Rendered against the real town_hall '
                'geometry (town_assets builder, unchanged) as a shadow-catching holdout, so it is occluded exactly '
                'like the building and carries its own soft shadows on the facade. Use: same world position as the '
                'town_hall sprite (attachTo / offset [0, 0]), depth = town_hall depth + 1.')


@l2('ribbon_garland', 'overlay', 'life2_wedding', fp=None, yaw=0.0, shadow=False, notes=GARLAND_NOTE,
    ko='마을회관 리본 장식', en='Town-hall ribbon garland', catcher=1.0, front='-Y', samples=40,
    extra={'attachTo': 'town_hall', 'attachOffset': [0, 0], 'attachDepth': 1})
def b_ribbon_garland():
    import town_assets as TA
    with L.Collect() as hall:
        TA.TOWN['town_hall']['fn']()
    BA.MARKERS.clear()
    hall_objs = [o for o in hall.objs]
    X, y0, PL, ST = 0.0, -0.75, 0.4, 1.5
    ye = y0 - 0.45 - 0.525                     # entablature front face
    ze = PL + ST * 2 - 0.2                     # entablature bottom
    with L.Collect() as deco:
        mb = G.MB()
        anchors = [-1.25, -0.95, -0.35, 0.35, 0.95, 1.25]
        for a, b in zip(anchors, anchors[1:]):
            depth = 0.13 if abs(b - a) < 0.4 else (0.32 if abs(a + b) < 0.1 else 0.27)
            G.garland(mb, G.sag((a, ye - 0.07, ze + 0.06), (b, ye - 0.07, ze + 0.06), depth, n=10),
                      G.WEDDING_COLS, seed=int(100 + a * 10), r=0.1, step=0.05, flower_every=1, rose_r=0.07)
        # garland along the raking edges of the pediment
        rake = [(x, ye - 0.07, PL + ST * 2 + 0.06 + (1.22 - abs(x)) / 1.22 * 0.66) for x in
                [-1.22 + 2.44 * k / 16 for k in range(17)]]
        G.garland(mb, rake, G.WEDDING_COLS, seed=115, r=0.085, step=0.05, flower_every=1, rose_r=0.062)
        # heart wreath of roses on the door
        hp = [(x, y0 - 0.12, PL + 1.0 + z) for x, z in T.heart_pts(0.2, 28)]
        G.garland(mb, hp + [hp[0]], (G.ROSE, G.PINK, G.WHITE), seed=120, r=0.04, step=0.035, flower_every=2,
                  rose_r=0.038, filler=False)
        # flower bunches at the outer column bases
        for sx in (-1, 1):
            G.flower_ball(mb, (sx * 0.95, -1.55 - 0.18, PL + 0.1), 0.18, G.WEDDING_COLS, n=14, seed=130 + sx,
                          zmin=-0.3, leaves=9, rr=0.065)
        mb.done('swags')
        pink, white = G.satin(G.RIBBON_PINK), G.satin(G.RIBBON_WHITE)
        for k, x in enumerate((-0.95, -0.35, 0.35, 0.95)):
            G.bow('cbow', (x, ye - 0.16, ze + 0.02), 0.16, pink if k % 3 == 0 else white, tails=0.62, tail_out=0.06)
        # ribbon spirals around the outer columns (radius 0.11 -> wrap at 0.125)
        for cx in (-0.95, -0.35, 0.35, 0.95):
            cy, sx = -1.55, (1 if cx > 0 else -1)
            for j, m in enumerate((pink, white)):
                pts, nrm = [], []
                for k in range(61):
                    t = k / 60.0
                    a = j * math.pi + t * math.tau * 2.5 + (0.6 if sx > 0 else 0.0)
                    pts.append((cx + 0.128 * math.cos(a), cy + 0.128 * math.sin(a), PL + 0.12 + t * (ze - PL - 0.25)))
                    nrm.append((math.cos(a), math.sin(a), 0.0))
                spiral_strip('spiral', pts, nrm, 0.075, m)
        # bunting from the flag poles to the portico corners
        cols = [flat(c, 0.6) for c in ('#F28DB2', '#FBF7F0', '#7FCDB8', '#F7D25A', '#B9A3E6')]
        for sx in (-1, 1):
            p0 = Vector((sx * 2.35, -1.1 - 0.05, 2.45))
            p1 = Vector((sx * 1.25, ye - 0.03, ze + 0.1))
            line = G.sag(p0, p1, 0.18, n=14)
            L.tube('bline', [tuple(p) for p in line], 0.012, flat('#F4F1EA', 0.5))
            n = 8
            for k in range(n):
                t = (k + 0.5) / n
                i = t * 14
                i0 = int(i)
                p = line[i0].lerp(line[min(i0 + 1, 14)], i - i0)
                d = (line[min(i0 + 1, 14)] - line[i0]).normalized()
                tri = bunting_flag('flag', p, d, 0.19, 0.22, cols[k % len(cols)])
                del tri
        # bows on the two street lamps
        for sx in (-1, 1):
            G.bow('lbow', (sx * 1.55, -2.2 - 0.07, 1.6), 0.12, pink, tails=0.42, tail_out=0.04)
    deco_objs = [o for o in deco.objs]
    return {'fit_objs': deco_objs, 'catch_objs': hall_objs,
            'fx': {'doorHeart': (X, y0 - 0.12, PL + 1.0), 'portico': (X, ye, ze)}}


def spiral_strip(name, pts, normals, width, mat, thick=0.008):
    """Band wrapped around a column: the band face looks along its own (radial) normal at every point."""
    P = [Vector(p) for p in pts]
    bm = bmesh.new()
    left, right = [], []
    for i, p in enumerate(P):
        t = (P[min(i + 1, len(P) - 1)] - P[max(i - 1, 0)]).normalized()
        side = t.cross(Vector(normals[i])).normalized()
        left.append(bm.verts.new(p + side * width / 2))
        right.append(bm.verts.new(p - side * width / 2))
    for i in range(len(P) - 1):
        bm.faces.new((left[i], right[i], right[i + 1], left[i + 1]))
    ob = L.finish(name, bm, [mat], smooth=True)
    sol = ob.modifiers.new('Sol', 'SOLIDIFY')
    sol.thickness = thick
    sol.offset = 0.0
    return ob


def bunting_flag(name, top, along, w, h, mat):
    """Little pennant hanging under a string point `top` (its plane contains the string direction + vertical)."""
    a = Vector(along).normalized()
    pts3 = [Vector(top) - a * w / 2, Vector(top) + a * w / 2, Vector(top) - Vector((0, 0, h))]
    bm = bmesh.new()
    vs = [bm.verts.new(p) for p in pts3]
    bm.faces.new(vs)
    ob = L.finish(name, bm, [mat], smooth=False)
    sol = ob.modifiers.new('Sol', 'SOLIDIFY')
    sol.thickness = 0.01
    return ob


# =========================================================================== MEMORIAL GARDEN

GARDEN_NOTE = ('Memorial garden 추모 정원 (4.8 x 3.5 m, faces the camera): a gentle, warm little flower garden - a '
               'pale sage lawn ringed by rounded cream stones, a winding path of warm stepping stones, a blossoming '
               'plum tree, a wooden bench, a glowing stone lantern and a low snowy hedge at the back, pastel flower '
               'beds in front. Six stone spots (small pale pavers with flowers) wait for memorial_stone sprites. '
               'stonePoints = memorial_stone anchors (stoneDirs = which way the stone faces); draw stones, mourners, '
               'wreaths and walkers ABOVE the garden sprite (stoneDepth "front": garden depth + 1 + dy*0.001) - every '
               'tall part (tree, bench, lantern, hedge) is at the back, behind the stone spots. seatPoints = bench '
               '(sit_S), gatherPoints = mourners in front of the stones (facing N), doorPoint = the path entrance, '
               'pathPoints = the stepping-stone walk from the entrance to the bench. fxPoints.lantern = warm glow '
               '(night), tree = falling petals.')

STONE_SPOTS = ((-1.5, 0.42), (-0.78, 0.42), (1.12, 0.42), (1.82, 0.36), (-1.18, -0.5), (1.3, -0.5))
PATH = ((0.0, -1.62), (0.07, -1.16), (0.18, -0.72), (0.24, -0.27), (0.2, 0.18), (0.24, 0.6), (0.33, 0.92))


@l2('memorial_garden', 'decor', 'life2_memorial', fp=(4.8, 3.5), yaw=45.0, notes=GARDEN_NOTE, ko='추모 정원',
    en='Memorial garden', catcher=22.0, front='S', samples=40, extra={'stoneDepth': 'front'})
def b_memorial_garden():
    A, B = 2.38, 1.72
    lawn = tonal('#CFE0BF', 0.07, 2.6, rough=0.95)
    cyl('lawn', 1.0, 0.045, (0, 0, 0), mat=lawn, segs=64, bevel=0.02, scale=(A, B, 1.0))
    rnd = L.rng(140)
    # snow patches on the lawn rim
    for k, a in enumerate((200, 235, 300, 330, 20, 160, 120)):
        r = math.radians(a)
        blob('lsnow', 0.3, (A * 0.86 * math.cos(r), B * 0.86 * math.sin(r), 0.03), flat('snow_mat', 0.9),
             scale=(1.6, 1.0, 0.12), seed=141 + k, amp=0.25, freq=2.0, subdiv=3)
    # border stones (gap at the entrance, front = -Y = -90 deg)
    st = tonal('#DCD5C8', 0.08, 7.0, rough=0.9)
    n = 46
    for k in range(n):
        a = math.tau * k / n
        if abs(math.degrees(a) - 270.0) < 13:
            continue
        r = rnd.uniform(0.085, 0.115)
        blob('bst', r, ((A + 0.04) * math.cos(a), (B + 0.04) * math.sin(a), 0.02), st, scale=(1.25, 1.0, 0.7),
             seed=150 + k, amp=0.15, freq=1.8, subdiv=2, flat_bottom=0.5)
    # path of stepping stones
    for k, (x, y) in enumerate(PATH):
        G.stepping_stone('path', (x, y), 0.21 + 0.03 * (k % 2), 0.16, rz_deg=rnd.uniform(-20, 20), seed=160 + k,
                         col='#E8D5B5', z=0.05)
    # stone spots: pale pavers with two little flower tufts
    mb = G.MB()
    for k, (x, y) in enumerate(STONE_SPOTS):
        box('spot', (0.62, 0.36, 0.05), (x, y, 0.02), mat=tonal('#E9E3D8', 0.05, 6.0, rough=0.9), bevel=0.04)
        for sx in (-1, 1):
            G.flower_mound(mb, (x + sx * 0.38, y + 0.08, 0.04), 0.09, 0.07, 0.04, G.GENTLE_COLS, n=4, seed=170 + 3 * k + sx,
                           kind='daisy', fr=0.045)
        mark('stone', (x, y, 0.0), facing=(0, -1, 0))
    # back: hedge, tree, bench, lantern
    for k in range(13):
        a = math.radians(18 + 144 * k / 12)
        x, y = (A - 0.2) * math.cos(a), (B - 0.12) * math.sin(a)
        for o in G.shrub('hedge', (x, y, 0.0), 0.24 + 0.03 * ((k * 7) % 3), seed=180 + k):
            pass
    for o in G.blossom_tree('tree', (-1.58, 0.98, 0.03), h=1.95, R=0.86, seed=190):
        pass
    G.garden_bench('bench', (0.42, 1.18, 0.04), length=1.3)
    for o in G.stone_lantern('lantern', (1.78, 0.98, 0.03), s=1.05):
        pass
    # flower beds: front corners, tree foot, bench ends, along the path
    beds = ((-1.72, -0.98, 0.42, 0.26, 26), (1.75, -0.95, 0.4, 0.25, 24), (-1.1, 1.2, 0.3, 0.2, 14),
            (-0.6, 1.12, 0.22, 0.16, 10), (1.38, 1.15, 0.24, 0.16, 10), (-0.42, -1.25, 0.2, 0.13, 9),
            (0.55, -1.3, 0.22, 0.13, 9), (0.62, 0.05, 0.16, 0.12, 6), (-0.3, 0.75, 0.18, 0.12, 7))
    for k, (x, y, rx, ry, nn) in enumerate(beds):
        G.flower_mound(mb, (x, y, 0.04), rx * 1.15, ry * 1.15, 0.14, G.GENTLE_COLS + (G.PINK,), n=int(nn * 1.6),
                       seed=200 + k, kind='daisy' if k % 2 else 'mum', fr=0.068)
    mb.done('flowers')
    # two little robins on the bench back (warmth)
    for k, x in enumerate((0.05, 0.24)):
        bx, by, bz = x, 1.42, 1.0
        sphere('robin', 0.055, (bx, by, bz), flat('#8A5A3C', 0.6), scale=(1.1, 0.9, 0.9), segs=12, rings=8)
        sphere('robin_b', 0.04, (bx, by - 0.035, bz - 0.005), flat('#E8724A', 0.6), scale=(1, 0.6, 0.9), segs=10,
               rings=6)
        sphere('robin_h', 0.035, (bx + (0.035 if k else -0.035), by - 0.01, bz + 0.05), flat('#8A5A3C', 0.6),
               segs=10, rings=6)
    # points
    for x in (0.42 - 0.32, 0.42 + 0.32):
        seat(x, 1.18 - 0.2, z=0.49)
    for k, (x, y) in enumerate(((-0.5, -1.18), (0.72, -1.18), (-0.42, -0.12), (0.7, -0.08), (-0.25, 0.32),
                                (0.68, 0.36))):
        mark('gather', (x, y, 0.0), facing=(0.0, 1.0, 0.0))
    mark('door', (0.0, -1.95, 0.0), facing=(0, 1, 0))
    for x, y in PATH:
        mark('path', (x, y, 0.0))
    return {'fx': {'lantern': (1.78, 0.98, 0.62), 'tree': (-1.58, 0.98, 1.9)}}


# =========================================================================== MEMORIAL STONE

STONE_NOTE = ('Memorial stone 추모석 (0.6 x 0.35 m, ~0.65 m tall): a small rounded pale stone on a low base, a soft '
              'gold heart above a blank cream plaque (plaquePoint: the game may write a tiny name), a little snow '
              'pillow on top, flower tufts and a laid posy at the base and a warm votive light. Faces the camera. '
              'Place at memorial_garden.stonePoints (draw above the garden). mournerPoints = family at the left / '
              'right of the stone facing it (E / W - sad / talk frames exist), layPoint = where someone steps up to '
              'lay flowers (faces N), wreathPoint = where a flower_wreath stands.')


@l2('memorial_stone', 'decor', 'life2_memorial', fp=(0.6, 0.35), yaw=45.0, notes=STONE_NOTE, ko='추모석',
    en='Memorial stone', catcher=8.0, front='S', samples=48)
def b_memorial_stone():
    base = tonal('#AFA89C', 0.06, 7.0, rough=0.9)
    box('base', (0.66, 0.36, 0.08), (0, 0.02, 0), mat=base, bevel=0.03)
    stone = tonal('#C4BDB1', 0.08, 5.0, rough=0.82)
    W, H, t = 0.46, 0.56, 0.15
    pts = [(-W / 2, 0.0), (W / 2, 0.0)] + [(W / 2 * math.cos(a), H - W / 2 + W / 2 * math.sin(a))
                                           for a in [math.pi * k / 18 for k in range(19)]]
    o = T.ext_xz('stone', pts, t, stone, y=0.09, bevel=0.04)
    o.location.z = 0.08
    plaque = flat('#EDE7DC', 0.8)
    o2 = T.ext_xz('plaque', T.rounded_rect_pts(0.3, 0.13, 0.035, 4, 0.0, 0.0), 0.012, plaque, y=0.09 - t + 0.004,
                  bevel=0.004)
    o2.location.z = 0.08 + 0.2
    hm = flat('#E9B8A0', 0.35, 0.4)
    o3 = T.ext_xz('heart', T.heart_pts(0.1, 30), 0.016, hm, y=0.09 - t + 0.004, bevel=0.006)
    o3.location.z = 0.08 + 0.4
    PA.snow_cap('snow', 0.12, (-0.03, 0.03, 0.08 + H - 0.015), 0.04, 7, scale=(1.3, 0.8, 1.0))
    mb = G.MB()
    for sx in (-1, 1):
        G.flower_mound(mb, (sx * 0.27, -0.13, 0.07), 0.12, 0.08, 0.06, G.GENTLE_COLS, n=8, seed=220 + sx,
                       kind='mum' if sx < 0 else 'daisy', fr=0.05)
    # a laid posy in front (three stems, white / blush / butter)
    for k, (col, dx) in enumerate(((G.WHITE, -0.05), (G.BLUSH, 0.0), (G.BUTTER, 0.05))):
        mb.seg((dx * 0.6 - 0.02, -0.1, 0.088), (dx - 0.1, -0.15, 0.086), 0.007, flat(G.LEAF, 0.6), segs=5)
        G.mum(mb, (dx + 0.03, -0.09, 0.1), 0.034, col, normal=(0.3, -0.5, 1.0))
    G.leaf(mb, (-0.04, -0.14, 0.09), 0.03, G.LEAF, (-1, -0.4, 0.1))
    mb.done('flowers')
    vm = L.emissive('votive', '#FFE2A0', '#FFB347', 2.4)
    cyl('votive', 0.032, 0.055, (0.2, -0.1, 0.08), mat=vm, segs=14, bevel=0.008)
    cyl('votive_rim', 0.036, 0.01, (0.2, -0.1, 0.08), mat=flat('#E7C66A', 0.4, 0.4), segs=14, bevel=0.003)
    L.point_light('votive_l', (0.2, -0.16, 0.17), 'window', 1.4, 0.03)
    snow_bits(((-0.35, 0.2, 0.08), (0.36, 0.22, 0.07)), seed=230)
    mark('mourner', (-0.52, -0.05, 0.0), facing=(1, 0, 0))
    mark('mourner', (0.52, -0.05, 0.0), facing=(-1, 0, 0))
    mark('lay', (0.0, -0.5, 0.0), facing=(0, 1, 0))
    mark('wreath', (-0.62, 0.28, 0.0))
    mark('plaque', (0.0, 0.09 - t, 0.08 + 0.2))
    return {'fx': {'votive': (0.2, -0.1, 0.15), 'top': (0, 0, 0.66)}}


# =========================================================================== FLOWER WREATH

WREATH_NOTE = ('Farewell flower wreath 근조 화환 (~1.15 m): a round wreath of white chrysanthemums with pale yellow, '
               'lilac and blush flowers and soft greenery on a light wooden easel, a lavender satin bow with long '
               'tails. Gentle, bright, no text. Stands beside a memorial_stone (its wreathPoint) or at the garden '
               'entrance. Faces the camera.')


@l2('flower_wreath', 'decor', 'life2_memorial', fp=('r', 0.32), yaw=45.0, notes=WREATH_NOTE, ko='추모 화환',
    en='Flower wreath', catcher=8.0, front='S', samples=48)
def b_flower_wreath():
    wood = tonal('#D9B486', 0.06, 5.0, rough=0.75)
    mb = G.MB()
    for sx in (-1, 1):
        mb.seg((sx * 0.26, -0.14, 0.0), (sx * 0.05, 0.02, 1.08), 0.022, wood, segs=8)
    mb.seg((0.0, 0.34, 0.0), (0.0, 0.05, 1.04), 0.02, wood, segs=8)
    mb.cube((0.58, 0.07, 0.035), wood, loc=(0, -0.06, 0.42))
    mb.done('easel')
    c = Vector((0, -0.1, 0.8))
    R = 0.3
    tilt = math.radians(12)                       # leans back on the easel
    ax_u = Vector((1, 0, 0))
    ax_v = Vector((0, math.sin(tilt), math.cos(tilt)))
    nrm = ax_u.cross(ax_v)                        # (0, -cos, sin) -> faces the front
    fl = G.MB()
    rnd = L.rng(240)
    for ring, rr, n, s in ((0, R, 22, 0.062), (1, R - 0.075, 16, 0.05), (2, R + 0.07, 18, 0.05)):
        for k in range(n):
            a = math.tau * k / n + ring * 0.3
            p = c + (ax_u * math.cos(a) + ax_v * math.sin(a)) * rr + nrm * (-0.01 if ring == 0 else -0.03)
            col = (G.WHITE, G.WHITE, G.BUTTER, G.WHITE, G.LILAC, G.BLUSH, G.WHITE)[(k + ring * 3) % 7]
            out = (ax_u * math.cos(a) + ax_v * math.sin(a)) * (0.25 if ring == 2 else 0.0)
            G.mum(fl, p, s * rnd.uniform(0.9, 1.1), col, normal=-nrm + out)
    for k in range(30):
        a = math.tau * k / 30
        d = ax_u * math.cos(a) + ax_v * math.sin(a)
        G.leaf(fl, c + d * (R + 0.11) + nrm * 0.0, 0.06, G.LEAF if k % 3 else G.LEAF_DARK, d - nrm * 0.3,
               roll=rnd.uniform(0, 60))
    fl.done('wreath')
    lav = G.satin(G.LAVENDER)
    bp = c - ax_v * (R + 0.04) - nrm * 0.07
    G.bow('bow', tuple(bp), 0.12, lav, tails=0.42, tail_out=0.07, tilt=-12)
    PA.snow_cap('snow', 0.1, (0.02, -0.02, 1.1), 0.035, 3)
    return {'fx': {'top': (0, -0.1, 1.15), 'centre': tuple(c)}}


# =========================================================================== CRADLE

CRADLE_NOTE = ('Baby cradle 요람 (decor, 0.8 x 0.5 m): honey-wood rocking cradle with a blush fabric hood with white '
               'scallops, a mint star blanket and a sleeping baby in a pink bonnet (closed happy eyes, rosy cheeks). '
               'anims.rock = gentle 4-frame rocking loop (4 fps, frame names repeat: 3 images). cradle_empty = the '
               'same cradle with the blanket folded and no baby (same frame + anchor). babyPoint = the baby\'s face '
               '(Zzz / heart emotes). For porches, the clinic (baby born) and homes.')

CR_ANG = (0.0, 9.0, 0.0, -9.0)


@l2('cradle', 'decor', 'life2_decor', fp=(0.85, 0.55), yaw=0.0, notes=CRADLE_NOTE, ko='요람', en='Cradle',
    catcher=8.0, front='-Y', samples=48, sprites=['cradle', 'cradle_empty'])
def b_cradle():
    pivot = bpy.data.objects.new('cradle_pivot', None)
    bpy.context.scene.collection.objects.link(pivot)
    pivot.location = (0, 0, 0.6)
    wood = tonal('#E2B98A', 0.07, 4.0, rough=0.7)
    dark = tonal('#C48F5A', 0.07, 4.0, rough=0.7)
    with L.Collect() as body:
        for sx in (-1, 1):
            pts = []
            for k in range(13):
                a = math.radians(-32 + 64 * k / 12)
                pts.append((0.6 * math.sin(a), 0.6 - 0.6 * math.cos(a)))
            inner = [(0.53 * math.sin(math.radians(-30 + 60 * k / 12)),
                      0.6 - 0.53 * math.cos(math.radians(-30 + 60 * k / 12)) + 0.0) for k in range(12, -1, -1)]
            o = L.extrude('rocker', pts + inner, 0.05, rot=(90, 0, 90), top=dark, side=dark, bevel=0.012)
            o.location = (sx * 0.32 - 0.025, 0, 0)
            for sy in (-1, 1):
                box('rpost', (0.05, 0.05, 0.12), (sx * 0.32, sy * 0.17, 0.05), mat=dark, bevel=0.012)
        box('basket', (0.74, 0.44, 0.27), (0, 0, 0.13), mat=wood, bevel=0.07)
        box('rim', (0.78, 0.48, 0.045), (0, 0, 0.385), mat=dark, bevel=0.02)
        for k in range(7):
            x = -0.3 + k * 0.1
            box('slat', (0.03, 0.012, 0.18), (x, -0.226, 0.18), mat=dark, bevel=0.005)
        box('pillow', (0.2, 0.34, 0.07), (-0.24, 0, 0.39), mat=flat('#FFFFFF', 0.8), bevel=0.03)
        # hood (quarter dome over the head end) + scallops
        hood = hood_shell('hood', (-0.27, 0.0, 0.4), 0.27, flat('#F7C6D3', 0.8), flat('#FFF5F7', 0.85),
                          axis=(-1, 0, 0))
        del hood
        sc = G.MB()
        for k in range(15):
            a = math.pi * k / 14
            sc.sphere(0.03, flat('#FFFFFF', 0.8), loc=(-0.27 + 0.02, 0.27 * math.cos(a), 0.4 + 0.27 * math.sin(a)),
                      scale=(0.6, 1.0, 1.0), segs=8, rings=5)
        sc.done('scallops')
    with L.Collect() as full:
        bl = box('blanket', (0.48, 0.42, 0.07), (0.07, 0, 0.385), mat=flat('#BFE3D5', 0.85), bevel=0.03)
        del bl
        box('sheet', (0.08, 0.43, 0.08), (-0.14, 0, 0.385), mat=flat('#FFFFFF', 0.8), bevel=0.03)
        mb = G.MB()
        G.star_dots(mb, (0.08, 0, 0.0), 0.19, 0.16, 0.457, 9, col='#FFFFFF', seed=250, r=0.022)
        mb.done('stars')
        for o in G.baby('baby', (-0.2, 0.0, 0.5), s=0.95, bonnet='#F7A8C0', awake=False, look=(1, -1, 0), tilt=-58,
                        hand=False):
            pass
        sphere('bhand', 0.04, (-0.1, -0.07, 0.465), flat('#F9D2DE', 0.85), segs=10, rings=6)
    with L.Collect() as empty:
        box('blanket_f', (0.5, 0.4, 0.035), (0.05, 0, 0.365), mat=flat('#BFE3D5', 0.85), bevel=0.015)
        box('fold', (0.16, 0.4, 0.06), (0.2, 0, 0.385), mat=flat('#BFE3D5', 0.85), bevel=0.025)
        mb2 = G.MB()
        G.star_dots(mb2, (0.03, 0, 0.0), 0.15, 0.15, 0.402, 6, col='#FFFFFF', seed=251, r=0.02)
        mb2.done('stars_e')
    allobjs = body.objs + full.objs + empty.objs
    inv = Matrix.Translation((0, 0, 0.6)).inverted()
    for o in BA.top_level(allobjs):
        if o.parent is None and o is not pivot:
            o.parent = pivot
            o.matrix_parent_inverse = inv
    mark('baby', (-0.2, -0.06, 0.55), parent=None)

    def setter(ang, baby_on):
        def f():
            pivot.rotation_euler = (math.radians(ang), 0, 0)
            BA.show(BA.descendants(full.objs), baby_on)
            BA.show(BA.descendants(empty.objs), not baby_on)
        return f
    frames = [('cradle', setter(0.0, True)), ('cradle_rock_1', setter(CR_ANG[1], True)),
              ('cradle_rock_3', setter(CR_ANG[3], True)), ('cradle_empty', setter(0.0, False))]
    return {'frames': frames, 'rest': setter(0.0, True),
            'sprites': {'cradle': {'frame': 'cradle', 'anims': {'rock': {
                'frames': ['cradle', 'cradle_rock_1', 'cradle', 'cradle_rock_3'], 'fps': 4, 'repeat': -1}}},
                'cradle_empty': {'frame': 'cradle_empty'}},
            'fx': {'baby': (-0.2, 0.0, 0.62)}}


def hood_shell(name, center, r, outer, inner, axis=(-1, 0, 0), thick=0.02):
    """Quarter-sphere fabric hood: the half of a dome on the `axis` side (above z = centre z)."""
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=28, v_segments=14, radius=r)
    ax = Vector(axis).normalized()
    kill = [v for v in bm.verts if v.co.z < -1e-4 or v.co.dot(ax) < -1e-4]
    bmesh.ops.delete(bm, geom=kill, context='VERTS')
    ob = L.finish(name, bm, [outer, inner], loc=center, smooth=True)
    sol = ob.modifiers.new('Sol', 'SOLIDIFY')
    sol.thickness = thick
    sol.offset = 1.0
    sol.material_offset = 1
    return ob


# =========================================================================== SCHOOL DESK ROW

DESK_NOTE = ('School desk row 책상 줄 (decor, 2.3 x 0.9 m): three kid-size wooden desks on teal legs with little '
             'chairs behind them, facing SW (like the school front); a notebook + pencil, an apple + books and a '
             'pencil case on the desks. seatPoints = chair-seat front centre (0.45 m, the `sit` anchor; seatDirs SW '
             '= sit_SE flipX). Draw order: school_desk_row (depth d) -> seated kids (d + 0.5) -> '
             'school_desk_row_front overlay (d + 1, same frame + anchor: the desks only, so they hide the kids\' '
             'laps).')


@l2('school_desk_row', 'decor', 'life2_decor', fp=(2.3, 0.9), yaw=0.0, notes=DESK_NOTE, ko='교실 책상 줄',
    en='School desk row', catcher=10.0, front='-Y', samples=40)
def b_school_desk_row():
    top = tonal('#D9A066', 0.06, 4.0, rough=0.65)
    teal = flat('#3E8E7A', 0.45, 0.3)
    for k, x in enumerate((-0.75, 0.0, 0.75)):
        dy = -0.12
        box('dtop', (0.6, 0.42, 0.04), (x, dy, 0.62), mat=top, bevel=0.012)
        box('tray', (0.52, 0.34, 0.025), (x, dy + 0.01, 0.5), mat=flat('#8A5A33', 0.7), bevel=0.008)
        box('front', (0.52, 0.02, 0.1), (x, dy - 0.16, 0.5), mat=flat('#8A5A33', 0.7), bevel=0.006)
        for sx in (-1, 1):
            for sy in (-1, 1):
                cyl('dleg', 0.019, 0.62, (x + sx * 0.26, dy + sy * 0.17, 0), mat=teal, segs=8, bevel=0.004)
            cyl('dfoot', 0.016, 0.36, (x + sx * 0.26, dy - 0.18, 0.06), rot=(-90, 0, 0), mat=teal, segs=6, bevel=0.0)
        # chair
        cy = 0.28
        box('cseat', (0.36, 0.34, 0.035), (x, cy, 0.415), mat=top, bevel=0.012)
        box('cback', (0.34, 0.03, 0.15), (x, cy + 0.16, 0.6), mat=top, bevel=0.012)
        for sx in (-1, 1):
            for sy in (-1, 1):
                cyl('cleg', 0.017, 0.415, (x + sx * 0.15, cy + sy * 0.14, 0), mat=teal, segs=8, bevel=0.004)
            cyl('cpost', 0.016, 0.36, (x + sx * 0.15, cy + 0.15, 0.42), mat=teal, segs=6, bevel=0.0)
        # desk things
        if k == 0:
            for sx in (-1, 1):
                box('page', (0.15, 0.21, 0.012), (x + sx * 0.075, dy, 0.66), rot=(0, sx * 5, 0),
                    mat=flat('#FBF8F0', 0.8), bevel=0.003)
            box('line', (0.11, 0.004, 0.003), (x - 0.075, dy - 0.03, 0.674), mat=flat('#9CC7E6', 0.6), bevel=0.0)
            box('pencil', (0.17, 0.018, 0.018), (x + 0.16, dy + 0.12, 0.665), rot=(0, 0, 35),
                mat=flat('#F2C14E', 0.5), bevel=0.004)
        elif k == 1:
            sphere('apple', 0.055, (x + 0.16, dy - 0.06, 0.71), flat('#D9483B', 0.35), scale=(1, 1, 0.9), segs=16,
                   rings=10)
            cyl('stem', 0.006, 0.03, (x + 0.16, dy - 0.06, 0.755), mat=flat('#6E4428', 0.7), segs=6, bevel=0.0)
            for j, col in enumerate(('#3D7CC9', '#E8749A')):
                box('book', (0.2, 0.15, 0.035), (x - 0.08, dy + 0.02, 0.66 + 0.035 * j), rot=(0, 0, 8 - 12 * j),
                    mat=flat(col, 0.6), bevel=0.008)
        else:
            box('case', (0.22, 0.07, 0.05), (x - 0.04, dy + 0.06, 0.66), rot=(0, 0, -12), mat=flat('#7FB8E6', 0.6),
                bevel=0.02)
            box('eraser', (0.05, 0.03, 0.02), (x + 0.15, dy - 0.08, 0.66), mat=flat('#F28DB2', 0.6), bevel=0.006)
        seat(x, cy - 0.17)
    snow_bits(((-1.25, 0.3, 0.1), (1.22, -0.25, 0.1)), seed=280)
    return {'overlay': {'key': 'school_desk_row_front', 'at': (0.0, 0.105, 0.0), 'normal': (0.0, -1.0, 0.0)}}


# =========================================================================== ITEMS (72 x 72, anchor (36, 54))

@l2('item_bouquet', 'item', 'life2_items', item={'thickness': 0.16}, samples=64, ko='꽃다발', en='Bouquet',
    notes='Bouquet 꽃다발: pink / blush / white roses with greenery in a kraft-and-white paper cone tied with a pink '
          'satin bow, lying diagonally (flowers upper-right). Wedding mission item, gift, farewell flowers.')
def b_item_bouquet():
    with L.Collect() as c:
        kraft = tonal('#D9B98C', 0.05, 6.0, rough=0.85)
        # paper cone along +X (narrow end at -X)
        bm = bmesh.new()
        bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=20, radius1=0.05, radius2=0.2, depth=0.5,
                              matrix=Matrix.Rotation(math.radians(90), 4, 'Y'))
        L.finish('cone', bm, [kraft], loc=(-0.08, 0, 0.16))
        bm2 = bmesh.new()
        bmesh.ops.create_cone(bm2, cap_ends=False, cap_tris=False, segments=8, radius1=0.06, radius2=0.24, depth=0.34,
                              matrix=Matrix.Rotation(math.radians(90), 4, 'Y'))
        o = L.finish('wrap', bm2, [flat('#FBF7F0', 0.8)], loc=(0.03, 0, 0.16), smooth=False)
        sol = o.modifiers.new('Sol', 'SOLIDIFY')
        sol.thickness = 0.01
        mb = G.MB()
        G.flower_ball(mb, (0.24, 0, 0.17), 0.2, (G.PINK, G.WHITE, G.ROSE, G.BLUSH), n=18, seed=300, zmin=-0.9,
                      rr=0.07, leaves=12, filler=6, squash=(0.8, 1.0, 1.0))
        mb.done('flowers')
        G.bow('bow', (-0.16, -0.03, 0.24), 0.09, G.satin(G.RIBBON_PINK), tails=0.12, tail_out=0.02, rz=0.0, tilt=-60)
    BA._ground_item(c.objs, 30.0, -24.0)


@l2('item_cake', 'item', 'life2_items', item={'thickness': 0.22}, samples=64, ko='케이크', en='Cake',
    notes='Cake 케이크: round strawberry shortcake on a pale blue plate - white cream, a pink band, cream dollops with '
          'strawberries on top. Wedding / birthday / welcome-party mission item.')
def b_item_cake():
    with L.Collect() as c:
        cyl('plate', 0.3, 0.025, (0, 0, 0), mat=flat('#BFDDF2', 0.35), segs=36, bevel=0.01)
        cream = tonal('#FFF8EE', 0.03, 8.0, rough=0.55)
        cyl('cake', 0.25, 0.17, (0, 0, 0.025), mat=cream, segs=36, bevel=0.04)
        cyl('band', 0.252, 0.035, (0, 0, 0.07), mat=flat('#F4A6BE', 0.55), segs=36, bevel=0.008)
        mb = G.MB()
        for k in range(8):
            a = math.tau * k / 8
            p = (0.18 * math.cos(a), 0.18 * math.sin(a), 0.2)
            mb.sphere(0.045, flat('#FFFFFF', 0.45), loc=p, scale=(1, 1, 0.8), segs=12, rings=8)
            if k % 2 == 0:
                mb.cone(0.035, 0.008, 0.07, flat('#E0433F', 0.35), loc=(p[0], p[1], p[2] + 0.06), segs=12)
                mb.cone(0.022, 0.0, 0.015, flat(G.LEAF, 0.6), loc=(p[0], p[1], p[2] + 0.1), segs=6)
        mb.sphere(0.05, flat('#E0433F', 0.35), loc=(0, 0, 0.225), scale=(1, 1, 1.1), segs=14, rings=8)
        mb.done('top')
    BA._ground_item(c.objs, 0.0, 0.0)


@l2('item_gift_box', 'item', 'life2_items', item={'thickness': 0.24}, samples=64, ko='선물 상자', en='Gift box',
    notes='Gift box 선물 상자: sky-blue box with white polka dots, a pink ribbon cross and a big pink bow on top. '
          'Gifts between residents (relationships), welcome gifts, mission rewards.')
def b_item_gift_box():
    with L.Collect() as c:
        S, H = 0.38, 0.22
        box('box', (S, S, H), (0, 0, 0), mat=flat('#8EC5E8', 0.55), bevel=0.02)
        box('lid', (S + 0.03, S + 0.03, 0.06), (0, 0, H - 0.04), mat=flat('#8EC5E8', 0.5), bevel=0.018)
        mb = G.MB()
        rnd = L.rng(310)
        for face, nrm in ((0, (0, -1, 0)), (1, (1, 0, 0))):
            for k in range(7):
                u = rnd.uniform(-0.15, 0.15)
                v = rnd.uniform(0.03, H - 0.07)
                p = (u, -S / 2 - 0.003, v) if face == 0 else (S / 2 + 0.003, u, v)
                if abs(u) < 0.05:
                    continue
                mb.sphere(0.022, flat('#FFFFFF', 0.6), loc=p, rot=G.euler_deg_from_normal(nrm), scale=(1, 1, 0.25),
                          segs=10, rings=5)
        for k in range(6):
            u, v = rnd.uniform(-0.17, 0.17), rnd.uniform(-0.17, 0.17)
            if abs(u) < 0.05 or abs(v) < 0.05:
                continue
            mb.sphere(0.022, flat('#FFFFFF', 0.6), loc=(u, v, H + 0.022), scale=(1, 1, 0.25), segs=10, rings=5)
        mb.done('dots')
        pink = G.satin(G.RIBBON_PINK)
        box('rib1', (0.07, S + 0.04, H + 0.03), (0, 0, -0.005), mat=pink, bevel=0.01)
        box('rib2', (S + 0.04, 0.07, H + 0.03), (0, 0, -0.005), mat=pink, bevel=0.01)
        G.bow('bow', (0, 0, H + 0.08), 0.13, pink, rz=45.0, tails=0.0, tilt=-20)
    BA._ground_item(c.objs, 0.0, 0.0)


@l2('item_letter', 'item', 'life2_items', item={'thickness': 0.15}, samples=64, ko='편지', en='Letter',
    notes='Letter 편지: cream envelope with the flap closed by a red heart wax seal and a small pink heart stamp, '
          'tipped toward the viewer. Love letters, invitations (wedding), thank-you notes, delivery missions. '
          'stackStep is nominal (envelopes are thin).')
def b_item_letter():
    with L.Collect() as c:
        Wl, Hl = 0.58, 0.38
        paper = tonal('#F8EAD0', 0.03, 8.0, rough=0.75)
        box('env', (Wl, Hl, 0.025), (0, 0, 0), mat=paper, bevel=0.008)
        bm = bmesh.new()
        vs = [bm.verts.new(v) for v in ((-Wl / 2 + 0.01, Hl / 2 - 0.01, 0.026), (Wl / 2 - 0.01, Hl / 2 - 0.01, 0.026),
                                       (0.0, -0.03, 0.03))]
        bm.faces.new(vs)
        o = L.finish('flap', bm, [flat('#EBD7B2', 0.75)], smooth=False)
        sol = o.modifiers.new('Sol', 'SOLIDIFY')
        sol.thickness = 0.006
        for sx in (-1, 1):
            L.tube('crease', [(sx * (Wl / 2 - 0.015), -Hl / 2 + 0.015, 0.027), (sx * 0.06, 0.02, 0.027)], 0.0025,
                   flat('#E2D2B2', 0.8))
        o = L.extrude('seal', [(x * 1.0, y * 1.0) for x, y in T.heart_pts(0.1, 30)], 0.02,
                      top=flat('#D23C3C', 0.35), side=flat('#B8302F', 0.4), bevel=0.006)
        o.location = (0, -0.035, 0.028)
        box('stamp', (0.09, 0.11, 0.006), (Wl / 2 - 0.09, Hl / 2 - 0.09, 0.026), mat=flat('#7FB8E6', 0.6),
            bevel=0.004)
        o = L.extrude('sheart', T.heart_pts(0.04, 20), 0.004, top=flat('#FFFFFF', 0.5), bevel=0.001)
        o.location = (Wl / 2 - 0.09, Hl / 2 - 0.09, 0.032)
    BA._ground_item(c.objs, 42.0, -14.0)
