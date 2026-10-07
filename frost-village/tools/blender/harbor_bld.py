"""
harbor_bld.py - the harbour buildings besides the look-dev trio (docs/CONTRACT_V6.md section T): customs_house,
fish_auction, shipyard, harbor_market, seafood_restaurant, sailor_lodge, harbor_warehouse, harbor_office.

Same conventions as harbor_assets.py (z 0 = quay level, sea at harbor_lib.WATER_Z, front -Y = screen down-left,
waterfront buildings have their front footprint edge on the quay edge).  Registered into harbor_assets.HARBOR.
"""
import math

import bpy  # noqa: F401
from mathutils import Vector

import prop_lib as L
from prop_lib import C, flat, snowy, tonal, box, cyl, sphere, blob, extrude, hexmix
import prop_assets as PA
import life_assets as LA
import bld_assets as BA
import town_lib as T
import harbor_lib as H
from harbor_assets import harbor, iso_px, arch_window
from bld_assets import mark


def clapboard(col, n=4.6):
    return L.stripes(col, hexmix(col, '#000000', 0.1), n, 'Z', rough=0.8, soft=0.05)


def roof_sign(name, x, y, z, emblem, bg='#F4F1EA', rim=H.NAVY, r=0.5, es=1.0):
    """Round sign standing on two little legs at (x, y, z = foot height), facing the camera."""
    iron = flat('#3D424C', 0.45, 0.6)
    side = Vector((math.cos(math.radians(45)), math.sin(math.radians(45)), 0.0))
    for s in (-1, 1):
        p = Vector((x, y, z)) + side * s * r * 0.55
        cyl(name + '_leg', 0.04, 0.42, tuple(p), mat=iron, segs=8)
    return T.sign_disc(name, (x, y, z + 0.38 + r), r=r, bg=bg, rim=rim, emblem=emblem, es=es, tilt=8.0)


def chair(name, loc, rz, col):
    cm = flat(col, 0.5)
    parts = [box(name + '_s', (0.34, 0.34, 0.05), (0, 0, 0.42), mat=cm, bevel=0.02),
             box(name + '_b', (0.34, 0.05, 0.4), (0, 0.16, 0.45), mat=cm, bevel=0.02)]
    for lx in (-0.13, 0.13):
        for ly in (-0.13, 0.13):
            parts.append(cyl(name + '_l', 0.02, 0.42, (lx, ly, 0), mat=flat('#2E3A4A', 0.4, 0.5), segs=6))
    return L.group(parts, name, loc=loc, rot=(0, 0, rz))


def cafe_table(name, x, y, top='#FFFFFF'):
    cyl(name + '_leg', 0.04, 0.68, (x, y, 0), mat=flat('#2E3A4A', 0.4, 0.5), segs=10)
    cyl(name + '_foot', 0.17, 0.04, (x, y, 0), mat=flat('#2E3A4A', 0.4, 0.5), segs=16)
    cyl(name + '_top', 0.32, 0.05, (x, y, 0.68), mat=flat(top, 0.5), segs=28, bevel=0.015)


def octopus(name, loc, s=1.0, col='#E8749A'):
    m = flat(col, 0.5)
    parts = [sphere(name + '_head', 0.11 * s, (0, 0, 0.12 * s), m, scale=(1, 1, 1.15), segs=16, rings=10)]
    mb = L.MB()
    for k in range(6):
        a = math.tau * k / 6
        p0 = Vector((0.05 * s * math.cos(a), 0.05 * s * math.sin(a), 0.04 * s))
        p1 = Vector((0.16 * s * math.cos(a + 0.4), 0.16 * s * math.sin(a + 0.4), 0.01 * s))
        mb.seg(p0, p1, 0.025 * s, m, segs=6, r2=0.012 * s)
    parts.append(mb.done(name + '_arms'))
    for sx in (-1, 1):
        parts.append(sphere(name + '_eye', 0.02 * s, (0.04 * s * sx + 0.06 * s, -0.08 * s, 0.15 * s),
                            flat('#1E2430', 0.3), segs=8, rings=6))
    return L.group(parts, name, loc=loc)


def sack_open(name, loc, col, r=0.17, h=0.28):
    """Open spice / grain sack with a coloured heap on top."""
    x, y, z = loc
    cyl(name + '_bag', r, h, (x, y, z), mat=tonal('#D8C39A', 0.08, 5.0), segs=16, r_top=r * 1.05, bevel=0.04)
    H.torus(name + '_rim', r * 1.02, 0.03, (x, y, z + h), mats=[flat('#CDB689', 0.85)], M=16, K=6)
    blob(name + '_heap', r * 0.92, (x, y, z + h - 0.02), flat(col, 0.8), scale=(1.0, 1.0, 0.45), seed=int(r * 100),
         amp=0.12, subdiv=2)


# =========================================================================== CUSTOMS HOUSE

CUSTOMS_NOTE = ('Customs house (4.4 x 3.6 m): formal two-storey pale-stone building with a slate-blue roof, a columned '
                'porch and a pediment with a round balance-scales sign, a flag pole with the harbour flag, and on the '
                'right an inspection lane: red-white boom barrier, guard kiosk, a platform scale (inPoint = the '
                'inspection pad where porters set down imported goods) and a few checked crates. doorPoint = porch, '
                'customerPoints = queue at the door, staffPoints = [customs officer at the barrier, clerk at the '
                'door].')


@harbor('customs_house', 'building', 'harbor_buildings', fp=(4.4, 3.6), catcher=32.0, notes=CUSTOMS_NOTE,
        ko='세관', en='Customs house', zone='port')
def b_customs_house():
    BX, BY, W, D = -0.55, 0.45, 3.2, 2.2
    x0, x1, y0, y1 = BX - W / 2, BX + W / 2, BY - D / 2, BY + D / 2
    PL, ST = 0.28, 1.38
    Hh = PL + 2 * ST
    stone = L.brick('#E9E1D2', '#DED4C2', '#F6F2EA', scale=1.7, row_h=0.32, brick_w=0.62, snow_top=True)
    box('plinth', (W + 0.14, D + 0.14, PL), (BX, BY, 0), mat=snowy('#9AA1AC', lo=0.75, hi=0.9), bevel=0.04)
    box('walls', (W, D, Hh - PL), (BX, BY, PL), mat=stone, bevel=0.04)
    T.corner_trims('ctrim', W, D, PL, Hh - PL, '#F4F1EA', x=BX, y=BY)
    T.band('band', W, D, PL + ST - 0.05, '#F4F1EA', h=0.1, x=BX, y=BY, snow=True, seed=81)
    T.band('cornice', W, D, Hh - 0.12, '#F4F1EA', h=0.15, out=0.08, x=BX, y=BY)
    ridge = Hh + 1.1
    T.gable('roof', W, D, Hh, ridge, 0.3, '#4F6B8A', T.plaster('#E9E1D2'), seed=82, x=BX, y=BY)
    # front pediment (cross gable) over the porch
    T.gable('ped', 1.5, 0.7, Hh - 0.05, Hh + 0.95, 0.12, '#4F6B8A', T.plaster('#F4F1EA'), seed=83, x=BX, y=y0 + 0.1,
            along='y', snow_frac=(0.72, 0.72))
    for k, x in enumerate((x0 + 0.5, x0 + 1.05, x1 - 1.05, x1 - 0.5)):
        T.win('wf1_%d' % k, (x, y0, PL + 1.1), 'y-', w=0.42, h=0.62, shutters=H.NAVY, seed=84 + k)
        T.win('wf2_%d' % k, (x, y0, PL + ST + 1.1), 'y-', w=0.42, h=0.62, shutters=H.NAVY, seed=90 + k)
    for k, y in enumerate((BY - 0.45, BY + 0.5)):
        T.win('ws1_%d' % k, (x1, y, PL + 1.1), 'x+', w=0.45, h=0.62, shutters=H.NAVY, seed=96 + k)
        T.win('ws2_%d' % k, (x1, y, PL + ST + 1.1), 'x+', w=0.45, h=0.62, shutters=H.NAVY, seed=98 + k)
    T.win('pedw', (BX, y0 - 0.25, Hh + 0.6), 'y-', w=0.36, round_=True, seed=99)
    # porch: door, columns, entablature, steps
    T.door('door', (BX, y0, PL), 'y-', w=0.82, h=1.3, col='#7A4A2A', frame_col='#F4F1EA', double=True, step=False)
    pz = PL + 1.55
    for s in (-1, 1):
        cyl('col', 0.08, pz - PL, (BX + s * 0.6, y0 - 0.6, PL), mat=flat('#FBF8F2', 0.6), segs=16, bevel=0.02)
        box('colb', (0.22, 0.22, 0.08), (BX + s * 0.6, y0 - 0.6, PL), mat=flat('#FBF8F2', 0.6), bevel=0.02)
        box('colc', (0.22, 0.22, 0.08), (BX + s * 0.6, y0 - 0.6, pz - 0.08), mat=flat('#FBF8F2', 0.6), bevel=0.02)
    box('porchfl', (1.55, 0.8, PL), (BX, y0 - 0.36, 0.0), mat=snowy('#C9CED6', lo=0.65, hi=0.85), bevel=0.03)
    for k in range(2):
        box('step', (1.35, 0.24, PL * (1 - 0.5 * k)), (BX, y0 - 0.88 - 0.2 * (1 - k), 0.0),
            mat=snowy('#C9CED6', lo=0.6, hi=0.8), bevel=0.03)
    box('entab', (1.55, 0.82, 0.14), (BX, y0 - 0.36, pz), mat=flat('#FBF8F2', 0.6), bevel=0.03)
    L.snow_slab('entsn', 1.45, 0.72, 0.06, (BX, y0 - 0.36, pz + 0.14), seed=85)
    T.lamp_wall('l1', (BX - 0.62, y0, PL + 1.35), 'y-')
    # scales sign on the pediment front
    T.sign_disc('psign', (BX, y0 - 0.12, Hh + 1.45), r=0.42, bg=H.NAVY, rim='#F2C14E', emblem=H.em_scales, es=0.85,
                tilt=6.0)
    # flag pole (left front)
    cyl('fpole', 0.04, 4.2, (x0 - 0.4, y0 - 0.55, 0), mat=flat('#E3E9F0', 0.3, 0.6), segs=10)
    cyl('fbase', 0.17, 0.16, (x0 - 0.4, y0 - 0.55, 0), mat=snowy('stone', lo=0.6, hi=0.8), segs=14, r_top=0.12)
    sphere('ftop', 0.06, (x0 - 0.4, y0 - 0.55, 4.23), flat('gold', 0.3, 0.8), segs=10, rings=6)
    PA.flag('flag', (x0 - 0.38, y0 - 0.55, 4.12), 0.75, 0.48, H.HBLUE, seed=6, emblem=True)
    # inspection lane on the right: kiosk, barrier, platform scale, checked crates
    KX, KY = 1.55, 0.95
    box('kiosk', (0.7, 0.7, 1.55), (KX, KY, 0), mat=T.plaster('#F4F1EA'), bevel=0.04)
    box('kband', (0.72, 0.72, 0.12), (KX, KY, 1.0), mat=flat(H.HRED, 0.5), bevel=0.02)
    box('kwin', (0.5, 0.06, 0.38), (KX, KY - 0.35, 1.08), mat=T.glow_mat('kglow', 1.5), bevel=0.02)
    box('kwin2', (0.06, 0.45, 0.38), (KX + 0.35, KY, 1.08), mat=T.glow_mat('kglow2', 1.5), bevel=0.02)
    T.hip_cap('kroof', 0.95, 0.95, 1.55, 0.42, H.NAVY, seed=86, x=KX, y=KY)
    bx, by = 1.95, -0.25
    cyl('bpost', 0.09, 0.95, (bx, by, 0), mat=flat('#E3E6EB', 0.5), segs=12)
    box('bbox', (0.26, 0.26, 0.4), (bx, by, 0.55), mat=flat(H.HRED, 0.5), bevel=0.04)
    box('barm', (0.07, 2.1, 0.08), (bx, by - 1.05 - 0.1, 0.82), mat=L.stripes(H.HRED, H.HWHITE, 1.0 / 0.32, 'Y',
                                                                                soft=0.01), bevel=0.02)
    cyl('brest', 0.05, 0.78, (bx, by - 2.15, 0), mat=flat('#E3E6EB', 0.5), segs=10)
    box('scale', (0.95, 0.75, 0.08), (1.2, -1.05, 0.0), mat=flat('#7D8592', 0.4, 0.6), bevel=0.02)
    box('scalet', (0.85, 0.65, 0.02), (1.2, -1.05, 0.08), mat=L.stripes('#9AA3AE', '#8A929D', 1.0 / 0.1, 'X',
                                                                        soft=0.05), bevel=0.0)
    cyl('dpost', 0.04, 1.0, (1.72, -0.72, 0), mat=flat(H.NAVY, 0.5), segs=8)
    cyl('dial', 0.17, 0.06, (1.72, -0.76, 1.08), rot=(90, 0, 45), mat=flat('#F7F5F0', 0.4), segs=24, origin='center',
        cap_mat=flat('#FBF8F2', 0.4))
    box('needle', (0.02, 0.01, 0.13), (1.69, -0.8, 1.08), rot=(0, 35, 45), mat=flat(H.HRED, 0.4), bevel=0.0,
        origin='center')
    for k, (x, y, z, s_) in enumerate(((0.85, -1.85, 0.0, 0.5), (1.4, -1.85, 0.0, 0.5), (1.12, -1.85, 0.5, 0.45))):
        PA.crate_model('ccr%d' % k, s_, (x, y, z), rot=(0, 0, 8 * k), seed=k)
        box('tag%d' % k, (0.12, 0.02, 0.08), (x + 0.08, y - s_ / 2 - 0.01, z + s_ * 0.6), mat=flat('#5CC86A', 0.5),
            bevel=0.0)
    T.flower_tub('tub1', (x0 + 0.05, y0 - 0.35, 0.0), r=0.2, evergreen=True, seed=87)
    LA.snow_drift('d1', 0.3, (x1 + 0.2, y1 + 0.15, 0.0), seed=88)
    # markers
    mark('door', (BX, y0 - 1.45, 0.0), facing=(0, 1, 0))
    for k in range(2):
        mark('customer', (BX - 0.15 + 0.08 * k, y0 - 1.85 - 0.42 * k, 0.0), facing=(0, 1, 0))
    mark('staff', (2.35, -0.9, 0.0), facing=(-1, -0.4, 0))
    mark('staff', (BX + 0.95, y0 - 1.15, 0.0), facing=(-0.4, -1, 0))
    mark('in', (1.2, -1.05, 0.0))
    return {'fx': {'flag': (x0 - 0.1, y0 - 0.55, 3.9), 'sign': (BX, y0 - 0.12, Hh + 1.45)}}


# =========================================================================== FISH AUCTION

AUCTION_NOTE = ('Fish auction hall (6.0 x 4.0 m, open hall on navy steel posts): blue-white striped gable roof with a '
                'louvred roof lantern and a big tuna on the ridge, wet concrete floor, rows of fish boxes on pallets '
                '(tuna, salmon, cod) in the back half, a plank back wall with a blank price board, the auctioneer\'s '
                'lectern with a hand bell (fxPoints.bell), hanging lamps, a spring scale. Its front edge is the quay '
                'edge (quayEdge): trawler crews drop the catch at inPoint; buyers buy from outPoint (+X side). '
                'staffPoints[0] = auctioneer (faces the buyers), staffPoints[1..2] = helpers among the boxes; '
                'customerPoints (= buyerPoints) = bidders in the front half facing the fish.')


@harbor('fish_auction', 'building', 'harbor_buildings', fp=(6.0, 4.0), catcher=38.0, notes=AUCTION_NOTE,
        ko='수산물 경매장', en='Fish auction', zone='port', ground={'land': [(-12.0, 12.0, -2.0, 12.0)]})
def b_fish_auction():
    Y0 = -2.0
    floor = L.stripes('#AEB8C4', '#A4AEBB', 1.0 / 0.6, 'X', rough=0.35, soft=0.02)
    box('floor', (6.0, 4.0, 0.05), (0, 0, -0.045), mat=floor, bevel=0.01)
    box('coping', (6.0, 0.22, 0.05), (0, Y0 + 0.11, -0.03), mat=flat('#E3E6EB', 0.8), bevel=0.02)
    for k in range(3):
        box('drain', (5.6, 0.05, 0.005), (0, -1.2 + 0.9 * k, 0.003), mat=flat('#7D8592', 0.5), bevel=0.0)
    post = flat(H.NAVY, 0.45, 0.3)
    EZ, RZ = 3.0, 3.85
    for x, y in ((-2.7, -1.45), (2.7, -1.45), (-2.7, 1.45), (-0.9, 1.45), (0.9, 1.45), (2.7, 1.45)):
        box('post', (0.16, 0.16, EZ), (x, y, 0), mat=post, bevel=0.02)
        box('postb', (0.26, 0.26, 0.14), (x, y, 0), mat=flat('#C9CED6', 0.8), bevel=0.02)
    for y in (-1.45, 1.45):
        box('beam', (5.7, 0.16, 0.26), (0, y, EZ - 0.26), mat=post, bevel=0.02)
    for sx in (-1, 1):
        H.beam('kbrace', (sx * 2.7, -1.45, EZ - 0.8), (sx * 2.15, -1.45, EZ - 0.26), 0.1, post)
    roofm = L.stripes(H.HBLUE, H.HWHITE, 1.0 / 0.7, 'X', rough=0.7, soft=0.01)
    with L.Collect() as rc:
        BA.gable_roof('roof', 6.4, 2.9, EZ, RZ, 0.42, roofm, snow_frac=(0.6, 0.62), seed=101, ridge_col='#22385E')
    gm = clapboard('#E9E1D2', 5.0)
    for s in (-1, 1):
        BA.gable_end('gend', 2.95, EZ - 0.02, RZ, s * 2.92, gm, thick=0.08)
    # roof lantern (louvred vent) + tuna on the ridge
    box('lant', (1.6, 0.6, 0.38), (0, 0, RZ + 0.05), mat=flat('#F4F1EA', 0.6), bevel=0.03)
    for k in range(6):
        box('louv', (0.04, 0.62, 0.22), (-0.6 + 0.24 * k, 0, RZ + 0.12), mat=flat(H.NAVY, 0.6), bevel=0.0)
    LA.roof('lroofF', 1.85, -0.45, RZ + 0.38, 0.0, RZ + 0.62, 0.06, roofm, snow_frac=0.8, seed=102)
    LA.roof('lroofB', 1.85, 0.45, RZ + 0.38, 0.0, RZ + 0.62, 0.06, roofm, snow_frac=0.8, seed=103)
    roof_sign('rsign', 1.75, 0.0, RZ - 0.02, lambda s: H.em_fish(s, 'tuna'), bg='#F4F1EA', rim=H.NAVY, r=0.62,
              es=1.05)
    H.gull('rgull', (-1.9, 0.1, RZ + 0.08), rz=-50.0, s=1.0)
    # back wall with a blank price board + window
    box('bwall', (5.7, 0.12, 2.1), (0, 1.62, 0.0), mat=clapboard('#E9E1D2', 5.0), bevel=0.02)
    box('board', (1.6, 0.06, 0.8), (-1.6, 1.53, 0.95), mat=flat('#2F3B36', 0.8), bevel=0.02)
    box('boardf', (1.7, 0.05, 0.9), (-1.6, 1.56, 0.9), mat=flat('#7A4A2A', 0.7), bevel=0.02)
    for k in range(3):
        box('bline', (1.1 - 0.15 * k, 0.01, 0.04), (-1.65, 1.49, 1.55 - 0.2 * k), mat=flat('#F4F1EA', 0.7),
            bevel=0.0)
    T.win('bw1', (1.2, 1.56, 1.3), 'y-', w=0.6, h=0.5, shutters=None, frame=H.HWHITE, seed=104)
    # fish boxes on pallets
    pal = tonal('#C49A6A', 0.1, 4.0)
    rows = [(-2.1, 0.3), (-0.85, 0.3), (0.4, 0.3), (1.65, 0.3), (-1.5, 0.95), (-0.2, 0.95), (1.05, 0.95)]
    kinds = ['tuna', 'fish', 'fish', 'tuna', 'fish', 'fish', 'fish']
    cols = ['#F4F1EA', '#3D7CC9', '#D9483B', '#F4F1EA', '#3D7CC9', '#F2B632', '#3D7CC9']
    for k, ((x, y), kd, cc) in enumerate(zip(rows, kinds, cols)):
        box('pallet', (1.05, 0.62, 0.12), (x, y, 0.0), mat=pal, bevel=0.015)
        H.fish_crate('fc%d' % k, (x - 0.22, y, 0.12), rz=0.0, kind=kd, s=0.9, seed=k, col=cc)
        H.fish_crate('fd%d' % k, (x + 0.27, y, 0.12), rz=4.0, kind='fish', s=0.8, seed=k + 9,
                     col=cols[(k + 2) % len(cols)])
    with L.Collect() as bt:
        BA.tuna_model('btuna', length=1.25, height=0.52, thick=0.3)
    L.group(BA.top_level(bt.objs), 'btunag', loc=(0.95, -0.25, 0.17), rot=(0, 0, 15))
    box('btpal', (1.3, 0.62, 0.1), (0.95, -0.25, 0.0), mat=pal, bevel=0.015)
    # lectern + bell (auctioneer, front left)
    box('lect', (0.45, 0.4, 0.95), (-2.1, -0.85, 0.0), mat=tonal('#8A5A33', 0.1, 4.0), bevel=0.03)
    box('lectt', (0.55, 0.48, 0.06), (-2.1, -0.85, 0.95), rot=(-12, 0, 0), mat=flat('#A86B3A', 0.7), bevel=0.02)
    with L.Collect() as bc_:
        T.bell_model('hbell', s=0.45)
    L.group(BA.top_level(bc_.objs), 'hbellg', loc=(-1.95, -0.85, 1.02))
    cyl('bhandle', 0.02, 0.18, (-1.95, -0.85, 1.12), mat=flat('#7A4A2A', 0.6), segs=8)
    # hanging lamps + spring scale + ice chest
    for x in (-1.8, 0.0, 1.8):
        cyl('lcord', 0.01, 0.82, (x, -0.1, EZ - 0.8), mat=flat('#2B2F3A', 0.5), segs=5)
        cyl('lshade', 0.26, 0.16, (x, -0.1, EZ - 0.9), mat=flat('#2E5E48', 0.5), segs=20, r_top=0.06, bevel=0.02)
        sphere('lbulb', 0.08, (x, -0.1, EZ - 0.92), L.emissive('lb%d' % int(x * 10), '#FFE2A0', '#FFD27A', 3.0),
               segs=12, rings=8)
    cyl('scpost', 0.04, 1.9, (2.55, -0.9, 0), mat=post, segs=8)
    box('scarm', (0.5, 0.04, 0.04), (2.35, -0.9, 1.88), mat=post, bevel=0.0)
    cyl('scdial', 0.13, 0.05, (2.15, -0.93, 1.6), rot=(90, 0, 45), mat=flat('#F7F5F0', 0.4), segs=20, origin='center')
    cyl('sccord', 0.01, 0.24, (2.15, -0.9, 1.66), mat=flat('#2B2F3A', 0.5), segs=5)
    cyl('scpan', 0.18, 0.05, (2.15, -0.9, 1.3), mat=flat('#C9CED6', 0.3, 0.7), segs=20, r_top=0.21)
    PA.fish_model('scfish', length=0.4, height=0.2, thick=0.1, loc=(2.15, -0.9, 1.38), rot=(0, 0, 30))
    box('icechest', (0.7, 0.45, 0.5), (-2.55, 0.9, 0.0), mat=flat('#F4F1EA', 0.5), bevel=0.05)
    box('icelid', (0.72, 0.47, 0.06), (-2.55, 0.9, 0.5), mat=flat(H.HBLUE, 0.5), bevel=0.02)
    for x in (-2.85, 2.85):
        H.bollard_model('fbol', (x, Y0 + 0.28, 0.0), s=0.8, seed=int(x * 3))
    LA.snow_drift('d1', 0.28, (3.0, 1.9, 0.0), seed=105)
    # markers
    mark('staff', (-2.45, -0.45, 0.0), facing=(1, -0.5, 0))
    mark('staff', (-0.35, 0.05, 0.0), facing=(0.2, -1, 0))
    mark('staff', (1.85, 0.0, 0.0), facing=(-0.3, -1, 0))
    for k, (x, y) in enumerate(((-1.2, -1.15), (-0.55, -1.25), (0.1, -1.15), (0.75, -1.3), (-0.85, -1.7),
                                (0.4, -1.7))):
        mark('customer', (x, y, 0.0), facing=(-0.2, 1, 0))
    mark('in', (2.2, -1.65, 0.0))
    mark('out', (3.45, 0.55, 0.0))
    mark('door', (0.0, -1.4, 0.0), facing=(0, 1, 0))
    return {'fx': {'bell': (-1.95, -0.85, 1.12), 'lamp': (0.0, -0.1, EZ - 0.92)},
            'extra': {'quayEdge': [iso_px(-3.0, Y0), iso_px(3.0, Y0)], 'buyerPointsNote':
                      'customerPoints are the bidders (buyerPoints alias)'}}


# =========================================================================== SHIPYARD

YARD_NOTE = ('Shipyard (7.0 x 5.0 m): a concrete slipway running down into the sea (front = quay edge, the ramp '
             'continues 0.9 m over the water) with a half-built wooden hull on a cradle - planked bow, bare ribs at '
             'the stern - scaffolding with a ladder on its visible side, a timber sheer-leg hoist holding a plank, a '
             'red-roofed workshop with a glowing forge (smoke at fxPoints.smoke), timber stacks. idle = quiet; '
             'anims.work = 4-frame loop: welding sparks at the keel and the stern frame, rivet-forge glow, the '
             'plank swinging on the hoist, forge smoke. workPoints = shipwrights around the hull, staffPoints = '
             'foreman, inPoint = timber delivery pad.')


def hull_mesh(name, Lh=4.2, Bm=1.7, Dh=1.15, frac=0.55, mat=None):
    """Half-planked hull along +Y (bow at +Y): planking for y > (1 - 2*frac) * Lh/2 portion toward the bow.
    Returns (planked object, sections) - sections = [(y, half_width, depth)] for the ribs."""
    import bmesh as _bm
    bm = _bm.new()
    NS, NU = 18, 14
    y_lo = Lh / 2 - frac * Lh
    rows = []
    secs = []
    for i in range(NS + 1):
        t = i / NS
        y = y_lo + (Lh / 2 - y_lo) * t
        f = (y + Lh / 2) / Lh                            # 0 stern .. 1 bow
        hw = Bm / 2 * (math.sin(math.pi * min(1.0, 0.18 + f * 0.82)) ** 0.7) if f < 0.98 else 0.02
        dep = Dh * (0.85 + 0.15 * f)
        secs.append((y, max(hw, 0.02), dep))
        row = []
        for j in range(NU + 1):
            a = math.pi * j / NU                          # 0 = starboard gunwale .. pi = port gunwale
            x = hw * math.cos(a)
            zz = dep - dep * (math.sin(a) ** 0.8) * (1.0 - 0.15 * f)
            row.append(bm.verts.new((x, y, zz)))
        rows.append(row)
    for i in range(NS):
        for j in range(NU):
            bm.faces.new((rows[i][j], rows[i][j + 1], rows[i + 1][j + 1], rows[i + 1][j]))
    _bm.ops.solidify(bm, geom=bm.faces[:], thickness=0.05)
    o = L.finish(name, bm, [mat or flat('#C98F55', 0.7)])
    return o, secs


@harbor('shipyard', 'building', 'harbor_buildings', fp=(7.0, 5.0), catcher=40.0, work=4, fps=8, notes=YARD_NOTE,
        ko='조선소', en='Shipyard', zone='port', ground={'land': [(-12.0, 12.0, -2.5, 12.0)]})
def b_shipyard():
    Y0 = -2.5
    RY1, RY0 = 1.0, -3.3                               # slipway: top end (z 0) .. foot (under the sea)
    GR = 0.62 / (RY1 - RY0)                            # gradient
    SL = math.atan(GR)

    def rz(y):                                          # slipway surface height at y
        return GR * (min(y, RY1) - RY1)
    # yard ground (paved apron) and the slipway wedge cut into it
    H.ground_tiles('yard', -3.5, 3.5, Y0, 2.5, c1='#D3D7DD', c2='#C9CED6', n=1.8)
    ramp_m = L.stripes('#B9BFC8', '#AEB5BF', 1.0 / 0.5, 'Y', rough=0.9, soft=0.03)
    wedge = extrude('ramp', [(RY1, 0.005), (RY0, rz(RY0)), (RY0, rz(RY0) - 0.25), (RY1, -0.25)], 2.6,
                    rot=(90, 0, 90), top=ramp_m, side=flat('#9AA1AC', 0.9), bevel=0.02)
    wedge.location = (-1.9, 0.0, 0.0)
    for sx in (-0.6, 0.6):
        H.beam('rrail', (-0.6 + sx, RY1, 0.03), (-0.6 + sx, RY0, rz(RY0) + 0.03), 0.07, flat('#7D848F', 0.4, 0.6))
    for k in range(8):
        y = RY1 - 0.55 * k - 0.2
        box('sleeper', (1.6, 0.12, 0.04), (-0.6, y, rz(y) + 0.005), mat=flat('#8A5A33', 0.8), bevel=0.01)
    yw = RY1 + H.WATER_Z / GR                           # where the slipway dips under the sea
    H.foam_line('rfoam', (-1.95, yw), (0.75, yw))
    for s_ in (-1, 1):
        H.foam_line('rfoam_s', (-0.6 + s_ * 1.32, yw), (-0.6 + s_ * 1.32, Y0), w=0.05)
    # hull on a cradle following the slope (bow up-slope toward +Y, stern toward the sea)
    nb = L.NB('hullpaint', rough=0.6)
    tc = nb.n('ShaderNodeTexCoord')
    sep = nb.n('ShaderNodeSeparateXYZ')
    nb.link(tc.outputs['Object'], sep.inputs[0])
    plank = nb.math('FRACT', nb.math('MULTIPLY', sep.outputs['Z'], 1.0 / 0.15))
    col = nb.mix_rgb(nb.map_range(plank, 0.88, 0.95), C('#C98F55'), C('#A86B3A'))
    col = nb.mix_rgb(nb.map_range(sep.outputs['Z'], 0.42, 0.44), C('#C0473A'), col)          # red bottom paint
    col = nb.mix_rgb(nb.map_range(sep.outputs['Z'], 0.9, 0.92), col, C('#F4F1EA'))           # white sheer strake
    nb.base(col)
    hull_m = nb.m
    with L.Collect() as hc:
        hull_mesh('hull', mat=hull_m)
        rib_m = flat('#A86B3A', 0.7)
        mb = L.MB()
        mb.seg((0, -2.15, 0.0), (0, 2.1, 0.0), 0.09, flat('#6E4428', 0.7), segs=8)                 # keel
        mb.seg((0, 2.1, 0.0), (0, 2.35, 1.35), 0.07, flat('#6E4428', 0.7), segs=8)                 # stem
        mb.seg((0, -2.15, 0.0), (0, -2.25, 1.1), 0.07, flat('#6E4428', 0.7), segs=8)               # sternpost
        for k in range(7):
            y = -2.05 + 0.32 * k
            f = (y + 2.1) / 4.2
            hw = 0.85 * (math.sin(math.pi * (0.18 + f * 0.82)) ** 0.7)
            dep = 1.15 * (0.85 + 0.15 * f)
            pts = []
            for j in range(11):
                a = math.pi * j / 10
                pts.append(Vector((hw * math.cos(a), y, dep - dep * (math.sin(a) ** 0.8) * (1 - 0.15 * f))))
            for p, q in zip(pts, pts[1:]):
                mb.seg(p, q, 0.04, rib_m, segs=6)
        for s_ in (-1, 1):                                                                      # sheer clamps
            mb.seg((s_ * 0.62, -2.1, 1.0), (s_ * 0.66, -0.1, 1.08), 0.035, rib_m, segs=6)
        mb.done('ribs')
        box('stemcap', (0.1, 0.12, 0.1), (0, 2.33, 1.32), mat=flat(H.HRED, 0.5), bevel=0.02)
    HY = -0.55
    L.group(BA.top_level(hc.objs), 'hullg', loc=(-0.6, HY, rz(HY) + 0.4), rot=(-math.degrees(SL), 0, 0))
    cradle = tonal('#8A5A33', 0.1, 4.0)
    for y in (-2.25, -1.1, 0.05, 1.2):
        zt = rz(y) + 0.4 + (y - HY) * 0.0
        zb = rz(y)
        box('cradle', (1.4, 0.2, zt - zb + 0.05), (-0.6, y, zb), mat=cradle, bevel=0.02)
        for s_ in (-1, 1):
            H.beam('shore', (-0.6 + s_ * 1.12, y, zb + 0.02), (-0.6 + s_ * 0.66, y, zt + 0.55), 0.07, cradle)
    # scaffold on the +X (visible) side
    wood = tonal('#C98F55', 0.08, 4.0)
    for y in (-1.9, -0.45, 1.0):
        for dx in (1.42, 1.9):
            cyl('spole', 0.035, 1.75, (-0.6 + dx, y, 0.0), mat=wood, segs=8)
    for z in (0.55, 1.2):
        box('splank', (0.55, 3.15, 0.05), (-0.6 + 1.66, -0.45, z), mat=flat('#D9A066', 0.75), bevel=0.01)
        L.snow_slab('spsn', 0.45, 0.6, 0.03, (1.06, -0.9 + z, z + 0.05), seed=int(z * 10))
    for s in (-1, 1):
        H.beam('lrail', (1.55 + s * 0.15, 1.6, 0.0), (1.2 + s * 0.15, 1.2, 1.25), 0.03, flat('#8A5A33', 0.7))
    for k in range(6):
        t = (k + 0.5) / 6
        box('lrung', (0.32, 0.03, 0.03), (1.55 - 0.35 * t, 1.6 - 0.4 * t, 1.25 * t), mat=flat('#8A5A33', 0.7),
            bevel=0.0)
    # sheer-leg hoist with a swinging plank
    apex = Vector((-0.6, 0.35, 3.0))
    for s in (-1, 1):
        H.beam('sheer', (-0.6 + s * 1.5, 0.75, 0.0), tuple(apex), 0.1, flat('#8A5A33', 0.7))
    H.beam('sheerb', (-0.6, 2.2, 0.0), tuple(apex), 0.09, flat('#8A5A33', 0.7))
    cyl('pulley', 0.09, 0.08, tuple(apex + Vector((0, 0, -0.1))), rot=(90, 0, 0), mat=flat('#3A3E46', 0.5), segs=14,
        origin='center')
    with L.Collect() as pc:
        cyl('prope', 0.012, 1.0, (0, 0, -1.0), mat=flat(H.ROPE, 0.85), segs=6)
        box('plank', (1.6, 0.22, 0.07), (0, 0, -1.08), mat=flat('#D39A5E', 0.75), bevel=0.015)
        for s in (-1, 1):
            H.beam('psl', (s * 0.6, 0, -1.04), (0, 0, -0.85), 0.012, flat(H.ROPE, 0.85))
    swing = L.group(BA.top_level(pc.objs), 'swing', loc=tuple(apex + Vector((0, 0, -0.15))))
    # workshop (back right) with forge glow + chimney
    SX, SY, SW, SD, SH = 2.1, 1.25, 2.2, 1.9, 1.7
    box('shplinth', (SW + 0.1, SD + 0.1, 0.15), (SX, SY, 0), mat=snowy('#8E96A3', lo=0.7, hi=0.88), bevel=0.03)
    box('shwall', (SW, SD, SH - 0.15), (SX, SY, 0.15), mat=clapboard('#C98F55', 4.0), bevel=0.04)
    T.gable('shroof', SW, SD, SH, SH + 0.85, 0.22, H.HRED, clapboard('#C98F55', 4.0), seed=111, x=SX, y=SY)
    box('shdoor', (1.0, 0.08, 1.2), (SX - 0.2, SY - SD / 2 - 0.02, 0.15), mat=flat('#2B2420', 0.9), bevel=0.02)
    forge_m = L.emissive('forge', '#FF8A2A', '#FF7A1A', 1.5)
    box('forge', (0.6, 0.4, 0.55), (SX - 0.25, SY - SD / 2 + 0.3, 0.15), mat=flat('#5A3A2E', 0.8), bevel=0.04)
    box('coals', (0.42, 0.26, 0.06), (SX - 0.25, SY - SD / 2 + 0.3, 0.7), mat=forge_m, bevel=0.02)
    flight = L.point_light('forgel', (SX - 0.25, SY - SD / 2 - 0.1, 0.9), '#FF8A2A', 25.0, 0.1)
    T.win('shw', (SX + SW / 2, SY, 1.3), 'x+', w=0.5, h=0.5, shutters=H.HRED, seed=112)
    _, smoke_pt = T.chimney('shch', SX + 0.55, SY + 0.45, SH, SH + 1.1, col='#8E6A5A', w=0.28)
    smoke = L.Smoke('ysmoke', smoke_pt, n=3, rise=0.9, r0=0.1, r1=0.24, seed=7)
    roof_sign('ysign', SX - 0.3, SY - 0.1, SH + 0.62, H.em_hammer_hull, bg='#F4F1EA', rim=H.HRED, r=0.44, es=0.9)
    # timber stacks + rope + paint pots
    PA.log_pile('lpile', n_bottom=3, r=0.12, length=1.4, loc=(-2.85, 1.0, 0.0), seed=1)
    for k in range(4):
        box('lumber', (1.5, 0.22, 0.08), (-2.55, 1.9, 0.08 * k), rot=(0, 0, 2 * k), mat=flat(['#D39A5E', '#C98F55'][k % 2],
                                                                                           0.75), bevel=0.01)
    L.snow_slab('lumsn', 1.3, 0.2, 0.05, (-2.55, 1.9, 0.32), seed=113)
    H.rope_coil('rcoil', (1.9, -1.4, 0.0), r=0.2)
    for k, c in enumerate(('#D9483B', '#3D7CC9')):
        cyl('pot%d' % k, 0.09, 0.16, (2.5 + 0.22 * k, -0.95, 0.0), mat=flat(c, 0.5), segs=14, bevel=0.01)
    H.gull('ygull', (-0.6, 2.36, 1.45), rz=-80.0, s=0.9)
    # sparks (work only)
    spark_m = H.spark_mat('spark', '#FFE27A', 5.0)
    sp1 = L.Spray('sp1', (0.3, -1.5, 0.3), (0.5, -0.7, 1.0), spark_m, n=14, grav=1.6, r=0.034, spread=0.55, seed=3)
    sp2 = L.Spray('sp2', (0.2, 0.6, 1.2), (0.55, -0.4, 0.7), spark_m, n=12, grav=1.4, r=0.03, spread=0.5, seed=5)
    flash_m = H.spark_mat('flash', '#FFF6D0', 6.0)
    flash = sphere('flash', 0.09, (0.27, -1.48, 0.32), flash_m, segs=10, rings=6)
    flash.visible_shadow = False
    # markers
    for x, y, f in ((2.05, -1.25, (-1, 0.2, 0)), (-2.15, -0.25, (1, 0.1, 0)), (0.55, 1.75, (-1, -0.4, 0))):
        mark('work', (x, y, 0.0), facing=f)
    mark('staff', (2.6, 0.05, 0.0), facing=(-1, -0.3, 0))
    mark('in', (-2.85, -1.25, 0.0))

    def idle():
        sp1.show(False)
        sp2.show(False)
        flash.hide_render = True
        L.set_emission(forge_m, 1.2)
        flight.data.energy = 15.0
        smoke.show(False)
        swing.rotation_euler = (0.0, 0.0, 0.0)

    def work(i):
        sp1.set(i)
        sp2.set((i + 2) % 4)
        flash.hide_render = i % 2 == 1
        flash.scale = [(1.0, 1.0, 1.0), (1.0, 1.0, 1.0), (1.4, 1.4, 1.4), (1.0, 1.0, 1.0)][i]
        L.set_emission(forge_m, [1.6, 2.4, 1.8, 2.8][i])
        flight.data.energy = [25.0, 40.0, 30.0, 45.0][i]
        smoke.set(i)
        swing.rotation_euler = (math.radians([6.0, 0.0, -6.0, 0.0][i]), 0.0, math.radians([0.0, 8.0, 0.0, -8.0][i]))

    idle()
    return {'idle': idle, 'work': work,
            'fx': {'smoke': smoke_pt, 'sparks': (0.25, -1.5, 0.4), 'forge': (SX - 0.25, SY - SD / 2, 0.75)},
            'extra': {'quayEdge': [iso_px(-3.5, Y0), iso_px(3.5, Y0)]}}


# =========================================================================== HARBOUR MARKET

MARKET_NOTE = ('Harbour market (5.6 x 2.8 m): three stalls under red / blue / yellow striped awnings - fresh fish on '
               'ice with a cute octopus and dried fish, imported goods (open spice sacks, fabric bolts, glass jars), '
               'oranges + shell souvenirs. staffPoints = one seller behind each counter (staffDepth "behind": normal '
               'y-sorting draws them behind the stall so the counter hides their legs; the awnings are high enough '
               'for the head to show), customerPoints = two shoppers in front of each stall (stall order left to '
               'right), inPoint = restock pad on the right.')


@harbor('harbor_market', 'building', 'harbor_buildings', fp=(5.6, 2.8), catcher=32.0, notes=MARKET_NOTE,
        ko='항구 시장', en='Harbour market', zone='market')
def b_harbor_market():
    SW = 1.7
    stalls = [(-1.85, H.HRED), (0.0, H.HBLUE), (1.85, '#E8A93A')]
    wood = tonal('#B97C48', 0.1, 4.0)
    for k, (cx, col) in enumerate(stalls):
        # counter
        box('ctr%d' % k, (SW - 0.1, 0.5, 0.78), (cx, -0.15, 0.0), mat=clapboard('#C98F55', 6.0), bevel=0.03)
        box('ctrt%d' % k, (SW, 0.6, 0.06), (cx, -0.15, 0.78), mat=flat('#E9D2A8', 0.7), bevel=0.02)
        box('ctrp%d' % k, (SW - 0.06, 0.04, 0.12), (cx, -0.42, 0.62), mat=flat(col, 0.6), bevel=0.01)
        # posts + awning
        for s in (-1, 1):
            cyl('post%d' % k, 0.05, 2.15, (cx + s * (SW / 2 - 0.05), -0.38, 0), mat=wood, segs=10)
            cyl('postb%d' % k, 0.05, 2.4, (cx + s * (SW / 2 - 0.05), 0.85, 0), mat=wood, segs=10)
        PA.awning(SW + 0.1, 1.3, 2.42, 2.12, 0.9, -0.45, col, 'cream', 8, name='awn%d' % k, x=cx)
        # back shelf
        box('shelf%d' % k, (SW - 0.2, 0.3, 0.95), (cx, 0.75, 0.0), mat=wood, bevel=0.02)
        box('shelft%d' % k, (SW - 0.1, 0.36, 0.05), (cx, 0.75, 0.95), mat=flat('#E9D2A8', 0.7), bevel=0.02)
    # stall 1: fish on ice, octopus, dried fish string
    cx = stalls[0][0]
    box('icetray', (1.3, 0.42, 0.08), (cx, -0.15, 0.84), mat=flat('#E8F2FA', 0.25), bevel=0.03)
    for j in range(4):
        PA.fish_model('mf%d' % j, length=0.34, height=0.16, thick=0.09, loc=(cx - 0.45 + 0.3 * j, -0.16, 0.95),
                      rot=(0, 0, 90 + (j % 2) * 180 + 8 * j))
    octopus('octo', (cx + 0.55, -0.22, 0.88), s=1.0)
    H.fish_crate('mfc', (cx - 0.3, 0.75, 1.0), kind='fish', s=0.8, seed=2, col=H.HBLUE)
    mbd = L.MB()
    mbd.seg((cx - 0.75, -0.38, 1.85), (cx + 0.75, -0.38, 1.85), 0.012, flat(H.ROPE, 0.85), segs=5)
    mbd.done('dline')
    for j in range(5):
        PA.fish_model('df%d' % j, length=0.26, height=0.12, thick=0.05, loc=(cx - 0.6 + 0.3 * j, -0.38, 1.72),
                      rot=(90, 90, 0))
    # stall 2: imported goods (spice sacks, fabric bolts, jars)
    cx = stalls[1][0]
    for j, c in enumerate(('#D9483B', '#F2C14E', '#E8822A', '#5E9A4A')):
        sack_open('sp%d' % j, (cx - 0.55 + 0.37 * j, -0.12, 0.84), c, r=0.14, h=0.2)
    for j, c in enumerate(('#8E6CC9', '#3FA58C', '#E8749A', '#F4F1EA')):
        cyl('bolt%d' % j, 0.09, 0.62, (cx - 0.45 + 0.3 * j, 0.78, 1.0), rot=(90, 0, 0), mat=flat(c, 0.7), segs=16,
            origin='center', cap_mat=flat(hexmix(c, '#FFFFFF', 0.3), 0.7))
    for j, c in enumerate(('#7FC4E8', '#9FE0B0', '#F2C14E')):
        cyl('jar%d' % j, 0.08, 0.2, (cx - 0.3 + 0.3 * j, 0.68, 1.29), mat=flat(c, 0.15), segs=16, bevel=0.02)
        cyl('jlid%d' % j, 0.085, 0.05, (cx - 0.3 + 0.3 * j, 0.68, 1.49), mat=flat(H.HRED, 0.5), segs=16, bevel=0.01)
    # stall 3: oranges + shells
    cx = stalls[2][0]
    rnd = L.rng(9)
    for j in range(14):
        row = 0 if j < 9 else 1
        k = j if row == 0 else j - 9
        x = cx - 0.6 + 0.15 * (k % 9) + (0.07 if row else 0)
        sphere('orange%d' % j, 0.075, (x, -0.2 + rnd.uniform(-0.05, 0.05), 0.92 + 0.11 * row), flat('#F08A2A', 0.5),
               segs=12, rings=8)
    box('obasket', (0.9, 0.3, 0.06), (cx - 0.15, -0.2, 0.84), mat=tonal('#C9A26A', 0.1, 6.0), bevel=0.02)
    for j in range(5):
        cyl('shell%d' % j, 0.07, 0.05, (cx + 0.5 + 0.08 * (j % 2), -0.22 + 0.1 * (j // 2), 0.85),
            mat=flat(['#F7C6D9', '#F4E3C3', '#FBF8F2'][j % 3], 0.45), segs=10, r_top=0.02, bevel=0.01)
    PA.crate_model('ocrate', 0.42, (cx - 0.3, 0.75, 1.0), snow=False, seed=3)
    for j in range(5):
        sphere('oc%d' % j, 0.07, (cx - 0.38 + 0.08 * (j % 3), 0.7 + 0.08 * (j // 3), 1.44), flat('#F08A2A', 0.5),
               segs=10, rings=6)
    # little ship model + lantern string across the stalls
    pts = []
    for j in range(13):
        t = j / 12
        pts.append((-2.8 + 5.6 * t, -0.48, 2.15 - 0.25 * math.sin(math.pi * t)))
    L.smooth_tube('lstring', pts, 0.008, flat('#2B2F3A', 0.5))
    for j in range(1, 12, 2):
        sphere('lbulb%d' % j, 0.05, (pts[j][0], pts[j][1], pts[j][2] - 0.06),
               L.emissive('lbm%d' % j, ['#FFB21F', '#FF6A3D', '#FFD23F'][j % 3], None, 1.2), segs=10, rings=6)
    H.gull('mgull', (1.85, 0.35, 2.62), rz=-60.0, s=0.9)
    LA.snow_drift('d1', 0.24, (2.75, 0.9, 0.0), seed=121)
    PA.barrel_model('mbar', 0.25, 0.62, (-2.75, -0.55, 0.0), seed=4)
    # markers
    for k, (cx, _) in enumerate(stalls):
        mark('staff', (cx, 0.3, 0.0), facing=(0, -1, 0))
    for k, (cx, _) in enumerate(stalls):
        mark('customer', (cx - 0.3, -0.85, 0.0), facing=(0, 1, 0))
        mark('customer', (cx + 0.35, -1.0, 0.0), facing=(-0.2, 1, 0))
    mark('in', (3.1, 0.45, 0.0))
    return {'fx': {'lights': (0.0, -0.48, 1.95)}, 'extra': {'staffDepth': 'behind'}}


# =========================================================================== SEAFOOD RESTAURANT

REST_NOTE = ('Seafood restaurant (3.6 x 3.2 m): coral clapboard two-storey restaurant with a navy roof, a giant '
             'smiling crab on the roof, a glowing aquarium window with a crab and fish, a fish-shaped bracket sign, '
             'door with a striped canopy, terrace with two tables, chairs and a patio heater, menu board; grill smoke '
             'at fxPoints.smoke. doorPoint, customerPoints (queue), staffPoints (waiter), seatPoints (terrace '
             'chairs), inPoint (fresh fish delivery pad on the right).')


@harbor('seafood_restaurant', 'building', 'harbor_buildings', fp=(3.6, 3.2), catcher=30.0, notes=REST_NOTE,
        ko='해산물 식당', en='Seafood restaurant', zone='market')
def b_seafood_restaurant():
    BX, BY, W, D = -0.35, 0.4, 2.7, 2.3
    x0, x1, y0, y1 = BX - W / 2, BX + W / 2, BY - D / 2, BY + D / 2
    PL, ST = 0.18, 1.45
    Hh = PL + 2 * ST
    walls = clapboard('#E8735E', 4.6)
    T.plinth('plinth', W, D, h=PL, col='#8E96A3', x=BX, y=BY)
    box('walls', (W, D, Hh - PL), (BX, BY, PL), mat=walls, bevel=0.04)
    T.corner_trims('ctrim', W, D, PL, Hh - PL, H.HWHITE, x=BX, y=BY)
    T.band('band', W, D, PL + ST - 0.04, H.HWHITE, h=0.09, x=BX, y=BY, snow=True, seed=131)
    T.band('cornice', W, D, Hh - 0.1, H.HWHITE, h=0.12, out=0.06, x=BX, y=BY)
    ridge = Hh + 1.3
    T.gable('roof', W, D, Hh, ridge, 0.3, H.NAVY, walls, seed=132, x=BX, y=BY, along='y')
    T.win('gw', (BX, y0 - 0.1, Hh + 0.8), 'y-', w=0.42, round_=True, seed=133)
    for k, x in enumerate((BX - 0.62, BX + 0.62)):
        T.win('uw%d' % k, (x, y0, PL + ST + 1.12), 'y-', w=0.5, h=0.6, shutters=H.NAVY, seed=134 + k)
    T.win('sw1', (x1, BY - 0.4, PL + 1.15), 'x+', w=0.55, h=0.6, shutters=H.NAVY, seed=136)
    T.win('sw2', (x1, BY - 0.4, PL + ST + 1.12), 'x+', w=0.5, h=0.6, shutters=H.NAVY, seed=137)
    T.win('sw3', (x1, BY + 0.55, PL + ST + 1.12), 'x+', w=0.5, h=0.6, shutters=H.NAVY, seed=138)

    def tank(objs):
        objs.append(box('sand', (1.1, 0.16, 0.1), (0, -0.1, 0.0), mat=flat('#E9D2A8', 0.8), bevel=0.01))
        for j, (x, z, c) in enumerate(((-0.3, 0.45, '#F2C14E'), (0.15, 0.62, '#F08A5D'), (0.35, 0.35, '#F4F1EA'))):
            objs.append(PA.fish_model('tf%d' % j, length=0.2, height=0.1, thick=0.05, loc=(x, -0.1, z),
                                      rot=(-90, 0, 180 if j % 2 else 0)))
        with L.Collect() as cc:
            H.em_crab(0.35)
        objs.append(L.group(BA.top_level(cc.objs), 'tcrab', loc=(-0.15, -0.12, 0.2)))
        for j in range(3):
            objs.append(cyl('weed%d' % j, 0.02, 0.3 + 0.1 * j, (0.45 - 0.1 * j, -0.06, 0.08), mat=flat('#3E9A5A', 0.6),
                            segs=6, r_top=0.005))
        objs.append(sphere('bub', 0.025, (0.1, -0.12, 0.85), flat('#F4F1EA', 0.2), segs=8, rings=6))
    T.shop_window('aqua', (BX - 0.55, y0, PL + 0.3), 'y-', w=1.2, h=0.95, frame_col=H.HWHITE, display=tank,
                  back_col='#7FD3F0', glow=1.2, mullions=0)
    T.door('door', (BX + 0.75, y0, PL), 'y-', w=0.72, h=1.35, col=H.NAVY, frame_col=H.HWHITE, glass=True,
           canopy=(0.5, PL + 1.62), canopy_col=H.HRED)
    T.bracket_sign('bsign', (x1, y0), z=PL + 2.55, arm=0.55, r=0.38, bg='#7FD3F0', rim=H.NAVY,
                   emblem=lambda s: H.em_fish(s, 'salmon'), es=0.75)
    T.lamp_wall('lamp', (BX + 0.2, y0, PL + 1.6), 'y-')
    # giant crab on the roof (facing the camera)
    box('crabstand', (0.6, 0.6, 0.1), (BX, BY + 0.25, ridge - 0.05), mat=flat('#7A4A2A', 0.7), bevel=0.03)
    T.emblem_at('roofcrab', H.em_crab, (BX, BY + 0.25, ridge + 0.4), scale=1.7, tilt=4.0)
    _, smoke = T.chimney('chim', x0 + 0.4, BY + 0.6, Hh - 0.2, ridge + 0.1, col='#B4593F')
    # terrace on the right front: two tables, chairs, patio heater, menu board
    seats = []
    for k, (tx, ty) in enumerate(((x1 + 0.55, y0 - 0.15), (x1 + 0.45, y1 - 0.75))):
        cafe_table('tab%d' % k, tx, ty, top='#F4F1EA')
        cyl('tcup%d' % k, 0.045, 0.07, (tx - 0.08, ty, 0.73), mat=flat('#FFFFFF', 0.4), segs=12, r_top=0.055)
        PA.fish_model('tfish%d' % k, length=0.22, height=0.1, thick=0.05, loc=(tx + 0.08, ty - 0.05, 0.75))
        for j, (dx, dy, rz) in enumerate(((-0.5, 0.0, -90), (0.0, 0.48, 180))):
            chair('ch%d_%d' % (k, j), (tx + dx, ty + dy, 0), rz, H.TEAL)
            seats.append((tx + dx, ty + dy, rz))
    hx, hy = x1 + 0.9, BY + 0.35
    cyl('hpole', 0.04, 1.9, (hx, hy, 0), mat=flat('#9AA3AE', 0.3, 0.7), segs=10)
    cyl('hbase', 0.18, 0.1, (hx, hy, 0), mat=flat('#5A606B', 0.4, 0.6), segs=16)
    cyl('hglow', 0.08, 0.35, (hx, hy, 1.5), mat=L.emissive('heat', '#FF9A4A', '#FF7A2A', 2.0), segs=12)
    cyl('hhood', 0.36, 0.1, (hx, hy, 1.9), mat=flat('#9AA3AE', 0.3, 0.7), segs=20, r_top=0.08, bevel=0.02)
    PA.snow_cap('hsn', 0.18, (hx, hy, 1.97), 0.04, 3)
    bm_ = flat('#2F3B36', 0.8)
    for s in (-1, 1):
        box('menu', (0.45, 0.04, 0.65), (x0 - 0.05, y0 - 0.65 + s * 0.07, 0.0), rot=(s * 12, 0, 0), mat=bm_,
            bevel=0.015)
    box('menuf', (0.5, 0.18, 0.05), (x0 - 0.05, y0 - 0.65, 0.6), mat=flat('#7A4A2A', 0.7), bevel=0.015)
    LA.snow_drift('d1', 0.24, (x0 - 0.1, y1 + 0.1, 0.0), seed=139)
    # markers
    dx = BX + 0.75
    mark('door', (dx, y0 - 0.75, 0.0), facing=(0, 1, 0))
    for k in range(2):
        mark('customer', (dx + 0.12 + 0.08 * k, y0 - 1.15 - 0.42 * k, 0.0), facing=(0, 1, 0))
    mark('staff', (dx - 0.62, y0 - 0.62, 0.0), facing=(0.4, -1, 0))
    for cx, cy, rz in seats:
        mark('seat', (cx, cy, 0.0), facing=(-math.sin(math.radians(rz)), -math.cos(math.radians(rz)), 0))
    mark('in', (x1 + 0.6, y1 + 0.2, 0.0))
    return {'fx': {'smoke': smoke, 'sign': (x1 + 0.35, y0 - 0.35, PL + 2.0), 'heater': (hx, hy, 1.6)}}


# =========================================================================== SAILOR LODGE

LODGE_NOTE = ('Sailor lodge (3.4 x 3.0 m): tall three-storey inn of weathered blue clapboard with white trims, a red '
              'roof with a dormer, porthole windows, a second-floor balcony with striped sailor shirts drying on a '
              'line, a ship\'s-wheel bracket sign, lantern, a sea chest + bench + rope coil by the door; chimney smoke '
              'at fxPoints.smoke. doorPoint, staffPoints (landlady at the door), seatPoints (bench), customerPoints '
              '(arriving sailors).')


@harbor('sailor_lodge', 'building', 'harbor_buildings', fp=(3.4, 3.0), catcher=30.0, notes=LODGE_NOTE,
        ko='선원 숙소', en='Sailor lodge', zone='port')
def b_sailor_lodge():
    BX, BY, W, D = -0.25, 0.35, 2.5, 2.1
    x0, x1, y0, y1 = BX - W / 2, BX + W / 2, BY - D / 2, BY + D / 2
    PL, ST = 0.2, 1.35
    Hh = PL + 3 * ST
    walls = clapboard('#5E86B3', 4.8)
    T.plinth('plinth', W, D, h=PL, col='#8E96A3', x=BX, y=BY)
    box('walls', (W, D, Hh - PL), (BX, BY, PL), mat=walls, bevel=0.04)
    T.corner_trims('ctrim', W, D, PL, Hh - PL, H.HWHITE, x=BX, y=BY)
    for k in (1, 2):
        T.band('band%d' % k, W, D, PL + k * ST - 0.04, H.HWHITE, h=0.08, x=BX, y=BY, snow=True, seed=140 + k)
    T.band('cornice', W, D, Hh - 0.1, H.HWHITE, h=0.12, out=0.06, x=BX, y=BY)
    ridge = Hh + 1.15
    T.gable('roof', W, D, Hh, ridge, 0.3, H.HRED, walls, seed=143, x=BX, y=BY)
    # dormer on the front slope
    T.gable('dorm', 0.8, 0.7, Hh + 0.45, Hh + 0.95, 0.08, H.HRED, T.plaster(H.HWHITE), seed=144, x=BX, y=y0 + 0.1,
            along='y', snow_frac=(0.7, 0.7))
    box('dbody', (0.7, 0.7, 0.5), (BX, y0 + 0.1, Hh - 0.05), mat=T.plaster(H.HWHITE), bevel=0.03)
    T.win('dw', (BX, y0 - 0.26, Hh + 0.42), 'y-', w=0.32, round_=True, seed=145)
    # windows: portholes upstairs, square on the ground floor
    for f in (1, 2):
        for k, x in enumerate((BX - 0.65, BX + 0.65)):
            T.win('pw%d_%d' % (f, k), (x, y0, PL + f * ST + 1.0), 'y-', w=0.42, round_=True, seed=146 + 2 * f + k)
        T.win('ps%d' % f, (x1, BY, PL + f * ST + 1.0), 'x+', w=0.42, round_=True, seed=152 + f)
    T.win('gw1', (BX - 0.65, y0, PL + 1.1), 'y-', w=0.5, h=0.6, shutters=H.HWHITE, frame=H.HWHITE, seed=155)
    T.win('gs1', (x1, BY + 0.2, PL + 1.1), 'x+', w=0.5, h=0.6, shutters=H.HWHITE, frame=H.HWHITE, seed=156)
    T.door('door', (BX + 0.55, y0, PL), 'y-', w=0.7, h=1.3, col=H.HRED, frame_col=H.HWHITE, glass=True,
           step_depth=0.36)
    # balcony on the 2nd floor front with laundry
    bz = PL + ST
    box('balc', (1.9, 0.6, 0.08), (BX, y0 - 0.3, bz), mat=flat('#8A5A33', 0.7), bevel=0.02)
    L.snow_slab('bsn', 1.8, 0.5, 0.05, (BX, y0 - 0.3, bz + 0.08), seed=157)
    rail = flat(H.HWHITE, 0.6)
    for k in range(9):
        cyl('brail', 0.02, 0.55, (BX - 0.9 + 0.225 * k, y0 - 0.58, bz + 0.08), mat=rail, segs=6)
    box('brtop', (1.9, 0.06, 0.05), (BX, y0 - 0.58, bz + 0.62), mat=rail, bevel=0.01)
    for s in (-1, 1):
        H.beam('bbrace', (BX + s * 0.8, y0, bz - 0.5), (BX + s * 0.8, y0 - 0.55, bz - 0.02), 0.05,
               flat('#8A5A33', 0.7))
    for s in (-1, 1):
        cyl('lpole', 0.025, 0.85, (BX + s * 0.88, y0 - 0.5, bz + 0.62), mat=flat('#8A5A33', 0.7), segs=6)
    L.smooth_tube('lline', [(BX - 0.88, y0 - 0.5, bz + 1.42), (BX, y0 - 0.5, bz + 1.32), (BX + 0.88, y0 - 0.5, bz + 1.42)],
                  0.008, flat('#F4F1EA', 0.6))
    shirt = L.stripes('#F4F1EA', H.NAVY, 1.0 / 0.1, 'Z', soft=0.02)
    for k, x in enumerate((BX - 0.55, BX + 0.05, BX + 0.55)):
        mat = shirt if k != 1 else flat(H.HRED, 0.7)
        sz = 1.36 - 0.03 * (1 - abs(x - BX))
        box('shirt%d' % k, (0.36, 0.04, 0.38), (x, y0 - 0.5, bz + sz - 0.38), mat=mat, bevel=0.02)
        box('sleeve%d' % k, (0.56, 0.04, 0.12), (x, y0 - 0.5, bz + sz - 0.14), mat=mat, bevel=0.02)
    T.bracket_sign('wsign', (x1, y0), z=PL + 2.3, arm=0.55, r=0.38, bg='#F4F1EA', rim=H.NAVY,
                   emblem=H.em_wheel, es=0.8)
    T.lamp_wall('lamp', (BX + 0.05, y0, PL + 1.15), 'y-')
    H.life_ring('lring', (x1 + 0.03, BY - 0.5, PL + 1.0), rz=90.0)
    _, smoke = T.chimney('chim', x0 + 0.45, BY + 0.55, Hh - 0.2, ridge + 0.2, col='#8E6A5A')
    # by the door: bench, sea chest, rope coil, gull on the ridge
    T.town_bench('bench', (BX - 0.65, y0 - 0.45, 0.0), rot_z=0.0, col='#8A5A33')
    box('chest', (0.62, 0.4, 0.36), (x1 + 0.15, y0 - 0.45, 0.0), mat=tonal('#8A5A33', 0.1, 4.0), bevel=0.04)
    box('chestl', (0.64, 0.42, 0.1), (x1 + 0.15, y0 - 0.45, 0.36), mat=flat(H.NAVY, 0.6), bevel=0.03)
    for s in (-1, 1):
        box('chestb', (0.05, 0.43, 0.47), (x1 + 0.15 + s * 0.22, y0 - 0.45, 0.0), mat=flat('#C9A24A', 0.35, 0.6),
            bevel=0.01)
    PA.snow_cap('chsn', 0.18, (x1 + 0.15, y0 - 0.45, 0.46), 0.05, 4, scale=(1.4, 1, 1))
    H.rope_coil('coil', (x1 + 0.1, y0 + 0.1 - 0.1, 0.0), r=0.18)
    H.gull('lgull', (BX + 0.6, BY, ridge + 0.1), rz=-130.0, s=0.95)
    LA.snow_drift('d1', 0.25, (x0 - 0.15, y1, 0.0), seed=158)
    # markers
    dx = BX + 0.55
    mark('door', (dx, y0 - 0.7, 0.0), facing=(0, 1, 0))
    mark('staff', (dx + 0.6, y0 - 0.65, 0.0), facing=(-0.4, -1, 0))
    for x in (BX - 1.0, BX - 0.3):
        mark('seat', (x, y0 - 0.45, 0.0), facing=(0, -1, 0))
    for k in range(2):
        mark('customer', (dx + 0.1 * k, y0 - 1.1 - 0.45 * k, 0.0), facing=(0, 1, 0))
    return {'fx': {'smoke': smoke, 'sign': (x1 + 0.35, y0 - 0.35, PL + 1.8)}}


# =========================================================================== HARBOUR WAREHOUSE

WARE_NOTE = ('Harbour warehouse (6.4 x 4.6 m, big): twin-gabled brick + corrugated-metal store with snowy slate-grey '
             'roofs, one huge sliding door open (crates and sacks inside), one closed, a hoist beam with a net of '
             'sacks at the left gable, a big painted anchor on the right gable, a loading apron with pallets, a hand '
             'truck and barrels. doorPoint = the open bay, inPoint = drop pad in front of the open bay, outPoint = '
             'pickup pad on the right, staffPoints = warehouse clerk, workPoints = porters.')


@harbor('harbor_warehouse', 'building', 'harbor_buildings', fp=(6.4, 4.6), catcher=40.0, notes=WARE_NOTE,
        ko='항구 창고', en='Harbour warehouse', zone='port')
def b_harbor_warehouse():
    BX, BY, W, D = 0.0, 0.5, 5.8, 3.4
    x0, x1, y0, y1 = BX - W / 2, BX + W / 2, BY - D / 2, BY + D / 2
    PL, WH = 0.25, 2.6
    H.ground_tiles('apron', -3.2, 3.2, -2.3, y0, c1='#CDD2D9', c2='#C1C7CF', n=1.6)
    brick = L.brick('#B4593F', '#9C4A35', '#D9CFC2', scale=2.6, row_h=0.4, snow_top=True)
    metal = L.stripes('#7FA0B5', '#6E8FA5', 1.0 / 0.12, 'X', rough=0.5, soft=0.25)
    metal_y = L.stripes('#7FA0B5', '#6E8FA5', 1.0 / 0.12, 'Y', rough=0.5, soft=0.25)
    box('plinth', (W + 0.12, D + 0.12, PL), (BX, BY, 0), mat=snowy('#8E96A3', lo=0.75, hi=0.9), bevel=0.04)
    box('brick', (W, D, 1.25), (BX, BY, PL), mat=brick, bevel=0.04)
    up = box('upper', (W, D, WH - 1.5), (BX, BY, PL + 1.25), mat=metal, bevel=0.03)
    up.data.materials.append(metal_y)
    for p in up.data.polygons:
        if abs(p.normal.x) > 0.7:
            p.material_index = 1
    T.band('wband', W, D, PL + 1.2, '#E3E6EB', h=0.1, x=BX, y=BY, snow=True, seed=161)
    T.corner_trims('ctrim', W, D, PL, WH - PL, '#E3E6EB', x=BX, y=BY)
    roofc = '#5E6B7A'
    for k, gx in enumerate((x0 + W / 4, x1 - W / 4)):
        T.gable('roof%d' % k, W / 2, D, WH, WH + 1.2, 0.25, roofc, metal_y, seed=162 + k, x=gx, y=BY, along='y')
    box('valley', (0.2, D + 0.5, 0.1), (BX, BY, WH - 0.02), mat=flat('#4A5260', 0.6), bevel=0.02)
    # open door (left bay) with a dark interior + goods, closed door (right bay)
    lx, rx = x0 + W / 4, x1 - W / 4
    DW = 1.4
    box('dark', (DW, 0.06, 1.75), (lx, y0 + 0.02, PL), mat=L.emissive('interior', '#2B2420', '#5A3A22', 0.35),
        bevel=0.0)
    for s in (-1, 1):
        box('dfr', (0.12, 0.14, 1.85), (lx + s * (DW / 2 + 0.06), y0 - 0.02, PL), mat=flat('#E3E6EB', 0.6), bevel=0.02)
    box('dtop', (DW + 0.3, 0.14, 0.14), (lx, y0 - 0.02, PL + 1.82), mat=flat('#E3E6EB', 0.6), bevel=0.02)
    box('drail', (4.4, 0.08, 0.08), (lx + 1.2, y0 - 0.1, PL + 1.98), mat=flat('#3A3E46', 0.5), bevel=0.01)
    door = L.stripes('#C8473A', '#B23A30', 1.0 / 0.18, 'X', soft=0.08)
    box('slide', (DW, 0.08, 1.75), (lx + DW + 0.02, y0 - 0.14, PL), mat=door, bevel=0.02)
    box('closed', (DW, 0.08, 1.75), (rx, y0 - 0.05, PL), mat=door, bevel=0.02)
    for d_ in (lx + DW + 0.02, rx):
        for s in (-1, 1):
            H.beam('xb', (d_ - DW / 2 + 0.08, y0 - 0.2, PL + 0.08 if s > 0 else PL + 1.65),
                   (d_ + DW / 2 - 0.08, y0 - 0.2, PL + 1.65 if s > 0 else PL + 0.08), 0.07, flat('#F4F1EA', 0.6))
    for k, (x, z, s_) in enumerate(((lx - 0.33, PL, 0.5), (lx + 0.22, PL, 0.5), (lx - 0.1, PL + 0.5, 0.45))):
        PA.crate_model('ic%d' % k, s_, (x, y0 - 0.22, z), snow=False, seed=k + 5)
    PA.lantern('ilamp', (lx, y0 - 0.25, PL + 1.45), 0.13, 3.0)
    BA.sack('isack', (lx + 0.55, y0 - 0.35, 0.0), s=1.1, seed=3)
    # gable decor: hoist beam + net of sacks (left), painted anchor + round window (right)
    hz = WH + 0.55
    box('hoist', (0.14, 1.1, 0.14), (lx, y0 - 0.45, hz), mat=flat('#8A5A33', 0.7), bevel=0.02)
    cyl('hpul', 0.08, 0.08, (lx, y0 - 0.95, hz - 0.08), rot=(0, 90, 0), mat=flat('#3A3E46', 0.5), segs=12,
        origin='center')
    cyl('hrope', 0.012, 0.9, (lx, y0 - 0.95, hz - 1.0), mat=flat(H.ROPE, 0.85), segs=6)
    blob('netbag', 0.32, (lx, y0 - 0.95, hz - 1.25), BA.net_mat('#EFE9DA', '#D8C39A', 14.0), scale=(1.0, 1.0, 1.15),
         seed=7, amp=0.18, subdiv=2)
    with L.Collect() as ac:
        H.anchor_model('panchor', s=1.15, col='#F4F1EA', stock_col='#F4F1EA')
    L.group(BA.top_level(ac.objs), 'panchorg', loc=(rx, y0 - 0.06, WH + 0.5), rot=(0, 0, 0))
    T.win('rw', (lx, y0 - 0.03, WH + 1.0), 'y-', w=0.36, round_=True, seed=166)
    for k, y in enumerate((BY - 0.8, BY + 0.6)):
        T.win('sw%d' % k, (x1, y, PL + 1.0), 'x+', w=0.6, h=0.45, shutters=None, frame='#E3E6EB', seed=167 + k)
    T.lamp_wall('lamp1', (x0 + W / 2, y0, PL + 2.0), 'y-')
    # apron: pallets, hand truck, barrels
    pal = tonal('#C49A6A', 0.1, 4.0)
    box('pal1', (1.0, 0.8, 0.12), (rx - 0.3, y0 - 1.0, 0), mat=pal, bevel=0.015)
    for k, (dx, dy, dz) in enumerate(((-0.22, -0.16, 0.12), (0.24, -0.16, 0.12), (0.0, 0.18, 0.12),
                                      (0.0, 0.0, 0.58))):
        BA.sack('ps%d' % k, (rx - 0.3 + dx, y0 - 1.0 + dy, dz), s=1.0, seed=k, tie='#3D7CC9')
    for k in range(2):
        PA.barrel_model('wbar%d' % k, 0.24, 0.6, (x1 + 0.25, y0 + 0.2 + 0.5 * k, 0.0), seed=k + 2)
    box('htbase', (0.4, 0.3, 0.04), (lx + 1.9, y0 - 0.9, 0.0), mat=flat('#3A3E46', 0.5), bevel=0.01)
    for s in (-1, 1):
        H.beam('htr', (lx + 1.9 + s * 0.15, y0 - 0.78, 0.0), (lx + 1.9 + s * 0.15, y0 - 0.62, 1.1), 0.035,
               flat(H.HRED, 0.5))
        cyl('htw', 0.1, 0.05, (lx + 1.9 + s * 0.2, y0 - 0.72, 0.1), rot=(0, 90, 0), mat=flat('#2B2D33', 0.8),
            segs=14, origin='center')
    H.gull('wgull', (rx, BY, WH + 1.25), rz=-100.0, s=0.95)
    LA.snow_drift('d1', 0.3, (x0 - 0.1, y1, 0.0), seed=169)
    # markers
    mark('door', (lx, y0 - 0.6, 0.0), facing=(0, 1, 0))
    mark('in', (lx, y0 - 1.25, 0.0))
    mark('out', (x1 + 0.55, BY - 0.9, 0.0))
    mark('staff', (lx + 1.05, y0 - 0.55, 0.0), facing=(-0.4, -1, 0))
    mark('work', (lx - 0.7, y0 - 1.0, 0.0), facing=(0.3, 1, 0))
    mark('work', (rx + 0.6, y0 - 0.8, 0.0), facing=(-1, -0.2, 0))
    return {'fx': {'hoist': (lx, y0 - 0.95, hz - 1.25)}}


# =========================================================================== HARBOUR OFFICE

OFFICE_NOTE = ('Harbour master\'s office (3.2 x 3.0 m): small white office with navy trim and a three-storey look-out '
               'tower crowned by a glazed control room, a signal mast with yardarm and signal-flag lines, a radar '
               'antenna, the harbour flag, a round anchor sign over the door, a notice board and binoculars on a '
               'stand. doorPoint, staffPoints (harbour master at the door), customerPoints (captains reporting in), '
               'fxPoints.light (control-room glow), fxPoints.flag.')


@harbor('harbor_office', 'building', 'harbor_buildings', fp=(3.2, 3.0), catcher=32.0, notes=OFFICE_NOTE,
        ko='항만 관리소', en='Harbour office', zone='port')
def b_harbor_office():
    BX, BY, W, D = 0.25, 0.25, 2.3, 1.9
    x0, x1, y0, y1 = BX - W / 2, BX + W / 2, BY - D / 2, BY + D / 2
    PL, WH = 0.2, 1.75
    T.plinth('plinth', W, D, h=PL, col='#8E96A3', x=BX, y=BY)
    box('walls', (W, D, WH - PL), (BX, BY, PL), mat=T.plaster('#F7F5F0'), bevel=0.04)
    T.corner_trims('ctrim', W, D, PL, WH - PL, H.NAVY, x=BX, y=BY)
    T.flat_roof('roof', W + 0.1, D + 0.1, WH, col=H.NAVY, x=BX, y=BY, seed=171)
    T.door('door', (BX + 0.35, y0, PL), 'y-', w=0.72, h=1.3, col=H.NAVY, frame_col=H.HWHITE, glass=True,
           canopy=(0.45, PL + 1.55), canopy_col=H.NAVY)
    T.win('w1', (BX - 0.55, y0, PL + 1.15), 'y-', w=0.55, h=0.6, shutters=None, frame=H.NAVY, seed=172)
    T.win('ws', (x1, BY, PL + 1.15), 'x+', w=0.55, h=0.6, shutters=None, frame=H.NAVY, seed=173)
    T.sign_disc('dsign', (BX + 0.35, y0 - 0.12, WH + 0.38), r=0.36, bg=H.NAVY, rim='#F2C14E',
                emblem=lambda s: H.em_anchor(s, col='#F4F1EA'), es=0.8, tilt=6.0)
    # tower at the back left
    TX, TY, TW = x0 + 0.55, y1 - 0.5, 1.0
    TH = 3.7
    box('tower', (TW, TW, TH), (TX, TY, 0), mat=T.plaster('#F7F5F0'), bevel=0.04)
    T.band('tband', TW, TW, 2.2, H.NAVY, h=0.12, x=TX, y=TY, snow=True, seed=174)
    T.win('tw1', (TX, TY - TW / 2, 2.0), 'y-', w=0.36, h=0.42, shutters=None, frame=H.NAVY, seed=175)
    T.win('tw2', (TX + TW / 2, TY, 2.0), 'x+', w=0.36, h=0.42, shutters=None, frame=H.NAVY, seed=176)
    # control room: glass band + roof deck
    cz = TH
    box('cfloor', (TW + 0.3, TW + 0.3, 0.12), (TX, TY, cz), mat=flat(H.NAVY, 0.6), bevel=0.03)
    box('cglass', (TW + 0.1, TW + 0.1, 0.62), (TX, TY, cz + 0.12), mat=T.glow_mat('ctrl', 1.5), bevel=0.02)
    for sx in (-1, 1):
        for sy in (-1, 1):
            box('cpost', (0.08, 0.08, 0.62), (TX + sx * (TW / 2 + 0.03), TY + sy * (TW / 2 + 0.03), cz + 0.12),
                mat=flat(H.NAVY, 0.6), bevel=0.01)
    for f in ((0, -1), (1, 0)):
        for k in (-1, 1):
            if f[0] == 0:
                box('cmul', (0.04, 0.04, 0.62), (TX + k * 0.18, TY - TW / 2 - 0.06, cz + 0.12), mat=flat(H.NAVY, 0.6),
                    bevel=0.0)
            else:
                box('cmul', (0.04, 0.04, 0.62), (TX + TW / 2 + 0.06, TY + k * 0.18, cz + 0.12), mat=flat(H.NAVY, 0.6),
                    bevel=0.0)
    T.flat_roof('croof', TW + 0.35, TW + 0.35, cz + 0.74, col=H.HWHITE, parapet=0.12, x=TX, y=TY, seed=177)
    # radar + signal mast
    cyl('rmast', 0.04, 0.45, (TX - 0.2, TY + 0.2, cz + 0.88), mat=flat('#3A3E46', 0.5), segs=8)
    box('radar', (0.7, 0.1, 0.12), (TX - 0.2, TY + 0.2, cz + 1.33), rot=(0, 0, 30), mat=flat(H.HWHITE, 0.5),
        bevel=0.03, origin='center')
    mx, my = TX + 0.2, TY - 0.15
    cyl('smast', 0.045, 2.2, (mx, my, cz + 0.88), mat=flat(H.HWHITE, 0.5), segs=10)
    box('yard', (1.3, 0.05, 0.05), (mx, my, cz + 2.55), rot=(0, 0, 45), mat=flat(H.HWHITE, 0.5), bevel=0.0,
        origin='center')
    sphere('mtop', 0.06, (mx, my, cz + 3.1), flat('#F2C14E', 0.3, 0.7), segs=10, rings=6)
    d = Vector((math.cos(math.radians(45)), math.sin(math.radians(45)), 0)) * 0.62
    H.signal_flags('sf1', (mx + d.x, my + d.y, cz + 2.55), (x1 + 0.1, y0 + 0.1, WH + 0.25), n=7, sag=0.2, size=0.22)
    H.signal_flags('sf2', (mx - d.x, my - d.y, cz + 2.55), (x0 - 0.1, y0 - 0.1, WH + 0.1), n=6, sag=0.2, size=0.22,
                   cols=('#F2C14E', '#3D7CC9', '#D9483B', '#F4F1EA'))
    PA.flag('flag', (mx + 0.02, my, cz + 3.0), 0.55, 0.36, H.HBLUE, seed=5, emblem=True)
    # notice board, binoculars, life ring, bench
    for s in (-1, 1):
        cyl('npost', 0.035, 1.25, (x0 - 0.15 + s * 0.3, y0 - 0.55, 0.0), mat=flat('#7A4A2A', 0.6), segs=8)
    box('nboard', (0.75, 0.06, 0.5), (x0 - 0.15, y0 - 0.55, 0.75), mat=flat('#C98F55', 0.7), bevel=0.02)
    for k, c in enumerate(('#F4F1EA', '#F7E3A0', '#F4F1EA')):
        box('paper%d' % k, (0.16, 0.01, 0.2), (x0 - 0.38 + 0.22 * k, y0 - 0.59, 0.9 + 0.04 * (k % 2)), mat=flat(c, 0.7),
            bevel=0.0)
    L.snow_slab('nsn', 0.75, 0.1, 0.04, (x0 - 0.15, y0 - 0.55, 1.25), seed=178)
    bx_, by_ = x1 + 0.35, y0 - 0.35
    cyl('bpost', 0.04, 1.0, (bx_, by_, 0), mat=flat('#3A3E46', 0.5), segs=8)
    for s in (-1, 1):
        cyl('bino', 0.06, 0.28, (bx_ + s * 0.05, by_ - 0.1, 1.05), rot=(70, 0, 45), mat=flat(H.NAVY, 0.4, 0.4),
            segs=12, origin='center')
    H.life_ring('oring', (x1 + 0.03, BY + 0.55, PL + 0.95), rz=90.0)
    H.gull('ogull', (TX + 0.3, TY - 0.3, cz + 0.86), rz=-60.0, s=0.9)
    LA.snow_drift('d1', 0.25, (x1 + 0.2, y1 + 0.1, 0.0), seed=179)
    # markers
    dx = BX + 0.35
    mark('door', (dx, y0 - 0.75, 0.0), facing=(0, 1, 0))
    mark('staff', (dx - 0.62, y0 - 0.6, 0.0), facing=(0.4, -1, 0))
    for k in range(2):
        mark('customer', (dx + 0.1 * k, y0 - 1.15 - 0.42 * k, 0.0), facing=(0, 1, 0))
    return {'fx': {'light': (TX, TY, cz + 0.45), 'flag': (mx + 0.3, my, cz + 2.85)}}
