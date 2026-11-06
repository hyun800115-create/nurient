"""
deck43_assets.py - v4.3 「마을 새 단장」 step A art (docs/redesign_v43/engineering_plan.md §9): the fishing deck that
replaces the net (1단 / 2단 / 3단 + gangway, back + front layers), the rod holders (idle / bite / hooked), the empty fish
crate on land, and the 옷·신발 공방 small workshop.  Built with the SAME helpers, palette, camera, light and PPU as the
props / v3 buildings / the harbour (prop_lib, prop_assets, life_assets, bld_assets, harbor_lib are imported READ-ONLY).
deck43_render.py renders them into <tmp>/fv_cache/deck43, deck43_pack.py packs assets/deck43/.

Conventions (as prop_assets / bld_assets): 1 unit = 1 m, front = -Y (screen down-left), +X = screen down-right.
  * deck43_t<n>: origin = the WATER-plane point under the centre of the 1단 platform (world.js WORLD.deck x, y), so
    every tier shares one anchor and the game swaps the frame in place.  The planks lie DZ = 0.3 m above the water
    (world.js deck.lift 17 px).  Tiers, stools and the gangway use world.js WORLD.deck's numbers (deck-local metres).
    Back layer = the whole deck; front layer = only the objects of the builder's `front` block (the near railings,
    the gangway's near rail, the 3단 roof and its front posts), cut from the same render with an object mask, so a
    fisher on the planks is drawn between the two.
  * deck43_rod: origin = the holder's foot on the planks (the game lifts it by deck.lift); three frames (idle / bite /
    hooked) with a `tip` marker (the rod tip: the game draws the line, the float and the hooked fish from there).
  * fish_crate: an EMPTY open crate (ghost-sweep rule: the fish the crate holds are the pile's own item pictures).
  * workshop43: a lean-to workshop with a blank signboard (the game writes 옷·신발 공방 into signQuad); no goods painted
    that the game sells.
Not run directly.
"""
import math
from collections import OrderedDict

import bpy  # noqa: F401  (import before mathutils when bpy is a module)

import prop_lib as L
from prop_lib import flat, tonal, box, cyl
import prop_assets as PA
import life_assets as LA
import bld_assets as BA
import harbor_lib as HL

DECK43 = OrderedDict()

DZ = 0.30                                   # plank top above the water (m)
TIERS = {1: (-1.3, 1.3, -1.3, 1.3), 2: (-2.5, 1.3, -1.3, 1.3), 3: (-3.7, 1.3, -1.3, 1.3)}
GANG = (0.1, 1.2)                           # gangway x range
GANG_Y0 = -1.3 - 3.4                        # its land end (world.js deck.foot)
STOOLS = [(-0.35, 0.75), (-1.55, 0.75), (-2.75, 0.75)]
SEAT_H = 0.25                                # stool seat (the fisher sits on it: deck43_chars.SEAT_H)
PLANK = ('#C9A070', '#BE9466', '#D2AB7C', '#C49A6A')


def deck43(key, fp, samples=48, catcher=24.0, notes='', shadow=True):
    def deco(fn):
        DECK43[key] = dict(key=key, fn=fn, kind='building', atlas=key, fp=fp, yaw=0.0, shadow=shadow, samples=samples,
                           notes=notes, front='-Y', catcher=catcher, work=0, fps=8, item=None, sprites=None, extra={})
        return fn
    return deco


# =========================================================================== parts

def wood(c='#9A6A42', v=0.1):
    return tonal(c, v, 5.0, rough=0.82)


def planks_y(name, x0, x1, y0, y1, z, t=0.06, pitch=0.24, seed=0, z_at=None):
    """Planks long in X, laid one after another along Y (z_at(y) = the top at y, for the sloping gangway)."""
    n = max(1, int(round((y1 - y0) / pitch)))
    p = (y1 - y0) / n
    out = []
    for i in range(n):
        rnd = L.rng(seed * 31 + i)
        y = y0 + (i + 0.5) * p
        zz = z_at(y) if z_at else z
        c = PLANK[rnd.randrange(len(PLANK))]
        ln = (x1 - x0) + rnd.uniform(-0.05, 0.03)
        tilt = 0.0
        if z_at:
            tilt = math.degrees(math.atan2(z_at(y + 0.05) - z_at(y - 0.05), 0.1))
        out.append(box(name, (ln, p - 0.025, t), ((x0 + x1) / 2 + rnd.uniform(-0.02, 0.02), y, zz - t),
                       rot=(tilt, 0, rnd.uniform(-0.5, 0.5)), mat=HL.plank_mat(c), bevel=0.012))
    return out


def post(name, x, y, z_top, r=0.075, foam=True, snow=True, seed=0):
    """A timber post from the water (z = 0) up to z_top, a foam ring at its foot."""
    objs = [cyl(name, r, z_top + 0.02, (x, y, -0.02), mat=tonal('#7A5A3E', 0.12, 4.0, rough=0.85), segs=12,
                cap_mat=L.end_grain(light='#D9B48A', ring='#B88B5E'), bevel=0.015)]
    if snow:
        objs.append(PA.snow_cap(name + '_sn', r * 0.9, (x, y, z_top - 0.004), 0.045, seed))
    if foam:
        objs.append(HL.foam_ring(name + '_foam', x, y, r + 0.03, z=0.0, w=0.045, alpha=0.7))
    return objs


def rope_rail(name, pts, z, mat=None):
    """A slack rope between posts (pts: [(x, y), ...]) at height z."""
    m = mat or flat('#D9C39A', 0.85)
    out = []
    for a, b in zip(pts[:-1], pts[1:]):
        mid = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, z - 0.07)
        out.append(L.smooth_tube(name, [(a[0], a[1], z), mid, (b[0], b[1], z)], 0.016, m))
    return out


def stool(name, x, y, z0, seed=0):
    """A little three-legged stool (seat SEAT_H above the planks)."""
    w = wood('#8A5A36', 0.08)
    objs = [cyl(name + '_seat', 0.17, 0.05, (x, y, z0 + SEAT_H - 0.05), mat=wood('#A8743F', 0.06), segs=20,
                cap_mat=L.end_grain(light='#D9B48A', ring='#B88B5E'), bevel=0.015)]
    for k in range(3):
        a = math.radians(90 + k * 120)
        lx, ly = x + 0.1 * math.cos(a), y + 0.1 * math.sin(a)
        dx, dy = 0.06 * math.cos(a), 0.06 * math.sin(a)
        objs.append(L.tube(name + '_leg', [(lx + dx, ly + dy, z0), (lx, ly, z0 + SEAT_H - 0.05)], 0.022, w))
    objs.append(PA.snow_cap(name + '_sn', 0.12, (x + 0.04, y - 0.03, z0 + SEAT_H), 0.025, seed))
    return objs


def platform(name, T, seed=0):
    """Planks + edge beams + posts of one platform rectangle T = (x0, x1, y0, y1)."""
    x0, x1, y0, y1 = T
    objs = planks_y(name + '_pl', x0, x1, y0, y1, DZ, seed=seed)
    beam = wood('#7E5634', 0.1)
    # edge beams just under the planks (the camera sees the -Y and +X faces)
    objs.append(box(name + '_by', (x1 - x0 + 0.04, 0.09, 0.12), ((x0 + x1) / 2, y0 + 0.02, DZ - 0.17), mat=beam,
                    bevel=0.015))
    objs.append(box(name + '_by2', (x1 - x0 + 0.04, 0.09, 0.12), ((x0 + x1) / 2, y1 - 0.02, DZ - 0.17), mat=beam,
                    bevel=0.015))
    objs.append(box(name + '_bx', (0.09, y1 - y0, 0.12), (x1 - 0.02, (y0 + y1) / 2, DZ - 0.17), mat=beam,
                    bevel=0.015))
    objs.append(box(name + '_bx2', (0.09, y1 - y0, 0.12), (x0 + 0.02, (y0 + y1) / 2, DZ - 0.17), mat=beam,
                    bevel=0.015))
    # posts at the corners and every ~1.3 m along the edges
    nx = max(1, int(round((x1 - x0) / 1.25)))
    k = 0
    for i in range(nx + 1):
        x = x0 + 0.06 + (x1 - x0 - 0.12) * i / nx
        for y in (y0 + 0.06, y1 - 0.06):
            objs += post('%s_po%d' % (name, k), x, y, DZ - 0.03, snow=False, seed=seed + k)
            k += 1
    return objs


# =========================================================================== the deck tiers

def build_deck(tier):
    T = TIERS[tier]
    x0, x1, y0, y1 = T
    objs = []
    # ---- platform (the 1단 part, then the wider 2단 / 3단 part on the -X side)
    objs += platform('p1', TIERS[1], seed=1)
    if tier >= 2:
        objs += platform('p2', (TIERS[2][0], TIERS[1][0], y0, y1), seed=2)
    if tier >= 3:
        objs += platform('p3', (TIERS[3][0], TIERS[2][0], y0, y1), seed=3)
    # ---- gangway: from the snow (z 0) up to the planks, posts + a rope rail on both sides
    gx0, gx1 = GANG

    def gz(y):
        return max(0.0, min(DZ, DZ * (y - GANG_Y0) / (y0 - GANG_Y0)))
    objs += planks_y('gw', gx0, gx1, GANG_Y0, y0, DZ, t=0.05, pitch=0.2, seed=7, z_at=gz)
    beam = wood('#7E5634', 0.1)
    for sx, nm in ((gx0 + 0.03, 'gwsl'), (gx1 - 0.03, 'gwsr')):
        a, b = (sx, GANG_Y0 + 0.05, gz(GANG_Y0 + 0.05) - 0.08), (sx, y0, DZ - 0.08)
        objs.append(L.tube(nm, [a, b], 0.04, beam))
    gposts = []
    for k, yy in enumerate((GANG_Y0 + 0.15, GANG_Y0 + 1.25, GANG_Y0 + 2.35, y0 - 0.1)):
        for sx in (gx0 + 0.03, gx1 - 0.03):
            on_land = yy < GANG_Y0 + 1.6
            objs += post('gp%d_%d' % (k, int(sx * 10)), sx, yy, gz(yy) + 0.62, r=0.05, foam=not on_land, seed=20 + k)
            gposts.append((sx, yy, gz(yy) + 0.58))
    # ---- far railings: the -X end (back-left) and the +Y edge's left part (behind the stools there is open water: no
    #      rail where the fishers cast). Posts + rope.
    back = [(x0 + 0.06, y0 + 0.06), (x0 + 0.06, (y0 + y1) / 2), (x0 + 0.06, y1 - 0.06)]
    for k, (px, py) in enumerate(back):
        objs += post('rb%d' % k, px, py, DZ + 0.62, r=0.055, foam=False, seed=40 + k)
    objs += rope_rail('rrb', back, DZ + 0.56)
    # ---- stools (one per tier), a rope coil, a bucket (empty), a lantern post at the gangway head
    for i in range(tier):
        sx, sy = STOOLS[i]
        objs += stool('st%d' % i, sx, sy, DZ, seed=50 + i)
    objs += HL.rope_coil('coil', (0.75, -0.75, DZ), r=0.15, turns=3, rr=0.026)
    cyl('bucket', 0.13, 0.2, (-0.85, -0.85, DZ), mat=flat('#4F74A6', 0.5), segs=18, r_top=0.15, bevel=0.01,
        cap_mat=flat('#2A3340', 0.8))
    lp = (gx0 - 0.18, y0 + 0.12)
    objs += post('lamp', lp[0], lp[1], DZ + 1.45, r=0.05, foam=False, seed=60)
    PA.lantern('lan', (lp[0] + 0.0, lp[1] - 0.16, DZ + 1.22), 0.13, 3.0)
    box('lan_arm', (0.03, 0.2, 0.03), (lp[0], lp[1] - 0.08, DZ + 1.4), mat=wood('#5E3E26', 0.05), bevel=0.01)
    # snow drifts on the planks' corners (light)
    LA.snow_drift('sd1', 0.22, (x0 + 0.35, y1 - 0.3, DZ), seed=3, scale=(1.3, 1.0, 0.25))
    LA.snow_drift('sd2', 0.18, (x1 - 0.3, y0 + 0.35, DZ), seed=5, scale=(1.3, 1.0, 0.25))
    # ---- 3단: a small lean-to roof over the fishers' strip (+Y side). The boards and the back posts are in the BACK
    #      layer (the fishers sit under it and are drawn over it), only the two front posts are in the front layer
    if tier >= 3:
        rx0, rx1, ry0, ry1 = STOOLS[2][0] - 0.55, STOOLS[0][0] + 0.6, 0.2, y1 - 0.08
        zf, zb = DZ + 2.1, DZ + 1.8
        for (px, py, z) in ((rx0, ry1, zb), (rx1, ry1, zb)):
            cyl('roofpost', 0.055, z - DZ, (px, py, DZ), mat=wood('#7A4A2A', 0.08), segs=12, bevel=0.012)
        ang = math.degrees(math.atan2(zf - zb, ry1 - ry0))
        depth = math.hypot(ry1 - ry0, zf - zb) + 0.5
        n = int((rx1 - rx0 + 0.3) / 0.28)
        for i in range(n):
            xx = rx0 - 0.15 + (i + 0.5) * (rx1 - rx0 + 0.3) / n
            rnd = L.rng(300 + i)
            c = ('#B5643F', '#A85A39', '#C06C45')[rnd.randrange(3)]
            box('roofb', ((rx1 - rx0 + 0.3) / n - 0.015, depth, 0.05), (xx, (ry0 + ry1) / 2, (zf + zb) / 2 - 0.02),
                rot=(ang, 0, 0), mat=tonal(c, 0.08, 5.0, rough=0.8), bevel=0.01, origin='center')
        L.snow_slab('roofsnow', rx1 - rx0 + 0.25, depth * 0.5, 0.06, ((rx0 + rx1) / 2, (ry0 + ry1) / 2 + depth * 0.22,
                                                                       (zf + zb) / 2 + 0.0), rot=(ang, 0, 0), seed=9, droop=0.02)
    # ---- front layer: the near rails (the -Y edge left of the gangway, the +X edge), the gangway's near rail, the roof
    with L.Collect() as front:
        near = [(x0 + 0.06, y0 + 0.06), ((x0 + gx0) / 2, y0 + 0.06), (gx0 - 0.02, y0 + 0.06)]
        for k, (px, py) in enumerate(near):
            post('rn%d' % k, px, py, DZ + 0.5, r=0.05, foam=False, seed=70 + k)
        rope_rail('rrn', near, DZ + 0.44)
        side = [(x1 - 0.06, y0 + 0.06), (x1 - 0.06, -0.35)]
        for k, (px, py) in enumerate(side):
            post('rs%d' % k, px, py, DZ + 0.5, r=0.05, foam=False, seed=80 + k)
        rope_rail('rrs', side, DZ + 0.44)
        if tier >= 3:
            for (px, py, z) in ((STOOLS[2][0] - 0.55, 0.2, DZ + 2.1), (STOOLS[0][0] + 0.6, 0.2, DZ + 2.1)):
                cyl('roofpost_f', 0.055, z - DZ, (px, py, DZ), mat=wood('#7A4A2A', 0.08), segs=12, bevel=0.012)
        gr = [(gx1 - 0.03, yy, z) for (sx, yy, z) in gposts if sx > (gx0 + gx1) / 2]
        for a, b in zip(gr[:-1], gr[1:]):
            L.smooth_tube('gwr', [a, ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2 - 0.06), b], 0.016,
                          flat('#D9C39A', 0.85))
    # markers: the stools (seat floor points), the gangway foot and head, the lantern
    for i in range(tier):
        BA.mark('stool', (STOOLS[i][0], STOOLS[i][1], 0.0))
    BA.mark('foot', ((gx0 + gx1) / 2, GANG_Y0, 0.0))
    L.point_light('decklamp', (lp[0], lp[1] - 0.2, DZ + 1.3), 'glow', 4.0, 0.15)
    return {'front': front.objs, 'frames': [('deck43_t%d_back' % tier, None)],
            'sprites': {'deck43_t%d_back' % tier: {'frame': 'deck43_t%d_back' % tier}},
            'fx': {'lantern': (lp[0], lp[1] - 0.16, DZ + 1.22)}}


NOTE_DECK = ('낚시 좌대 (v4.3): planks DZ 0.3 m over the water, gangway to the snow at -Y, posts with foam rings. Anchor = the '
             'water-plane point under the 1단 centre (every tier the same). Draw _back (depth d), the fishers on the deck '
             '(d + 0.4, lifted 17 px), then _front (d + 0.6: the near rails, the gangway\'s near rail, the 3단 roof).')


@deck43('deck43_t1', fp=(2.6, 2.6), notes=NOTE_DECK)
def b_deck1():
    return build_deck(1)


@deck43('deck43_t2', fp=(3.8, 2.6), notes=NOTE_DECK)
def b_deck2():
    return build_deck(2)


@deck43('deck43_t3', fp=(5.0, 2.6), notes=NOTE_DECK)
def b_deck3():
    return build_deck(3)


# =========================================================================== rod holder (3 frames)

ROD_STATES = ('idle', 'bite', 'hooked')
# rod: three segments (base -> tip), each (length m, elevation deg) per state; it points E (+X +Y) out to sea
ROD_SEGS = {'idle': ((0.5, 40), (0.45, 34), (0.4, 26)),
            'bite': ((0.5, 36), (0.45, 20), (0.4, 2)),
            'hooked': ((0.5, 55), (0.45, 42), (0.4, 14))}


@deck43('deck43_rod', fp=(0.4, 0.4), samples=40, catcher=6.0,
        notes='Rod holder on the deck: frames deck43_rod_idle / _bite / _hooked; framePoints.tip = the rod tip (the game '
              'draws the line, the float and the hooked fish from there). Origin = the holder foot on the planks.')
def b_rod():
    w = wood('#6E4A30', 0.08)
    # the holder: a short post with a forked top, a little rope lashing
    cyl('holder', 0.045, 0.5, (0, 0, 0), mat=w, segs=12, bevel=0.01, cap_mat=L.end_grain(light='#D9B48A', ring='#B88B5E'))
    cyl('holder_ring', 0.052, 0.05, (0, 0, 0.32), mat=flat('#D9C39A', 0.85), segs=12, bevel=0.008)
    box('holder_foot', (0.16, 0.16, 0.04), (0, 0, 0), mat=wood('#5E3E26', 0.05), bevel=0.01)
    d = (1 / math.sqrt(2), 1 / math.sqrt(2))      # E on screen = +X +Y
    rodm = flat('#4E3220', 0.45)
    parts = {}
    for st in ROD_STATES:
        pts = [(0.0, 0.0, 0.42)]
        for ln, el in ROD_SEGS[st]:
            x, y, z = pts[-1]
            c = math.cos(math.radians(el))
            pts.append((x + d[0] * ln * c, y + d[1] * ln * c, z + ln * math.sin(math.radians(el))))
        objs = [L.smooth_tube('rod_' + st, pts, 0.017, rodm)]
        # cork grip + reel at the butt
        objs.append(cyl('cork_' + st, 0.022, 0.16, (0, 0, 0.36), mat=flat('#D8A86A', 0.8), segs=12, bevel=0.006))
        objs.append(cyl('reel_' + st, 0.03, 0.025, (0.03, -0.03, 0.47), rot=(90, 0, 45), mat=flat('#C8463D', 0.4),
                        segs=14, bevel=0.006, origin='center'))
        parts[st] = (objs, pts[-1])
    tip = BA.mark('tip', parts['idle'][1])

    def setter(st):
        def f():
            for k, (objs, _) in parts.items():
                BA.show(objs, k == st)
            tip.location = parts[st][1]
        return f
    frames = [('deck43_rod_' + st, setter(st)) for st in ROD_STATES]
    return {'frames': frames, 'sprites': {('deck43_rod_' + st): {'frame': 'deck43_rod_' + st} for st in ROD_STATES},
            'rodTips': True}


# =========================================================================== fish crate (empty)

@deck43('fish_crate', fp=(1.0, 0.7), samples=48, catcher=6.0,
        notes='The fish crate at the deck\'s gangway (the `fish` collection pile prop): an EMPTY open wooden crate, '
              'rope handles, a snowy rim. The fish it holds are the pile\'s own item pictures (ghost-sweep rule).')
def b_crate():
    Wc, Dc, Hc = 1.0, 0.7, 0.45
    m = tonal('#B97C48', 0.1, 4.0, rough=0.8)
    dark = flat('#3E2A1A', 0.9)
    box('cr_floor', (Wc, Dc, 0.04), (0, 0, 0), mat=m, bevel=0.01)
    box('cr_in', (Wc - 0.08, Dc - 0.08, 0.02), (0, 0, 0.04), mat=dark, bevel=0.005)
    for sx in (-1, 1):
        for k in range(3):
            box('cr_sx', (0.04, Dc, Hc / 3 - 0.012), (sx * (Wc / 2 - 0.02), 0, 0.01 + k * Hc / 3), mat=m, bevel=0.008)
    for sy in (-1, 1):
        for k in range(3):
            box('cr_sy', (Wc, 0.04, Hc / 3 - 0.012), (0, sy * (Dc / 2 - 0.02), 0.01 + k * Hc / 3), mat=m, bevel=0.008)
        HL.torus('cr_h', 0.06, 0.012, (0, sy * (Dc / 2 + 0.01), Hc * 0.66), rot=(90, 0, 0), mats=[flat('#D9C39A', 0.85)],
                 M=16, K=6)
    for sx in (-1, 1):
        for sy in (-1, 1):
            box('cr_post', (0.06, 0.06, Hc + 0.02), (sx * (Wc / 2 - 0.03), sy * (Dc / 2 - 0.03), 0), mat=flat('#7A4A2A', 0.8),
                bevel=0.01)
    L.snow_slab('cr_snow', Wc + 0.04, 0.08, 0.04, (0, -Dc / 2 + 0.02, Hc), seed=4, droop=0.01)
    LA.snow_drift('cr_d', 0.2, (Wc / 2 + 0.1, -0.1, 0), seed=6)
    return {'frames': [('fish_crate', None)], 'sprites': {'fish_crate': {'frame': 'fish_crate'}}}


# =========================================================================== 옷·신발 공방 (the bench as a small workshop)

@deck43('workshop43', fp=(2.8, 1.5), samples=48, catcher=12.0,
        notes='옷·신발 공방 (v4.3): the bag / boots bench as a small lean-to workshop. Blank signboard over the front: the '
              'game writes sign_workshop43 into signQuad. Nothing on it is sold by the game (no food, no goods).')
def b_workshop():
    W, D = 2.8, 1.5
    post_m = wood('#8A5A36', 0.08)
    dark = wood('#5E3E26', 0.06)
    # floor boards (a low platform)
    planks_y('ws_floor', -W / 2, W / 2, -D / 2, D / 2, 0.08, t=0.08, pitch=0.25, seed=11)
    # back wall (+Y) of planks with a shelf, posts, the lean-to roof sloping to the front
    zb, zf = 2.35, 1.9
    for sx in (-1, 1):
        cyl('ws_postb', 0.07, zb, (sx * (W / 2 - 0.08), D / 2 - 0.08, 0), mat=post_m, segs=14, bevel=0.015)
        cyl('ws_postf', 0.07, zf, (sx * (W / 2 - 0.08), -D / 2 + 0.12, 0), mat=post_m, segs=14, bevel=0.015)
    n = 10
    for i in range(n):
        x = -W / 2 + 0.1 + (i + 0.5) * (W - 0.2) / n
        rnd = L.rng(100 + i)
        box('ws_wall', ((W - 0.2) / n - 0.015, 0.05, zb - 0.1), (x, D / 2 - 0.05, 0.08),
            mat=HL.plank_mat(PLANK[rnd.randrange(4)]), bevel=0.008)
    box('ws_shelf', (W - 0.4, 0.22, 0.04), (0, D / 2 - 0.2, 1.35), mat=dark, bevel=0.01)
    # on the shelf: spools of thread, a folded stack of cloth, a boot last (no goods for sale)
    for k, c in enumerate(('#C8463D', '#3D7CC9', '#F2C230', '#3FA58C')):
        cyl('ws_spool', 0.04, 0.08, (-0.9 + k * 0.13, D / 2 - 0.2, 1.39), mat=flat(c, 0.6), segs=12, bevel=0.006)
    for k, c in enumerate(('#E8E0D2', '#9BB8D9', '#E8E0D2')):
        box('ws_cloth', (0.34, 0.2, 0.05), (0.55, D / 2 - 0.2, 1.39 + k * 0.052), mat=flat(c, 0.9), bevel=0.012)
    # a coat and a scarf on pegs at the back wall
    box('ws_coat', (0.42, 0.06, 0.62), (-0.3, D / 2 - 0.12, 0.62), mat=flat('#C8402F', 0.85), bevel=0.06, taper=(0.75, 1.0))
    box('ws_scarf', (0.1, 0.04, 0.55), (0.15, D / 2 - 0.12, 0.66), mat=L.stripes('#F2EDE2', '#2E8A8A', 6.0, 'Z'), bevel=0.02)
    # the work table at the front: a boot last (wooden foot form), a hammer, a measuring tape roll
    box('ws_table', (1.6, 0.6, 0.06), (0.35, -0.15, 0.78), mat=wood('#A8743F', 0.06), bevel=0.015)
    for sx in (-1, 1):
        for sy in (-1, 1):
            box('ws_leg', (0.07, 0.07, 0.78), (0.35 + sx * 0.72, -0.15 + sy * 0.24, 0.08), mat=dark, bevel=0.01)
    box('ws_last', (0.26, 0.11, 0.1), (0.1, -0.15, 0.84), mat=flat('#C99A62', 0.7), bevel=0.04)
    cyl('ws_last_post', 0.03, 0.14, (0.0, -0.15, 0.84), mat=dark, segs=10, bevel=0.005)
    box('ws_hammer_h', (0.24, 0.025, 0.025), (0.6, -0.25, 0.85), rot=(0, 0, 20), mat=flat('#8A5A36', 0.7), bevel=0.006)
    box('ws_hammer_k', (0.05, 0.07, 0.05), (0.71, -0.21, 0.85), rot=(0, 0, 20), mat=flat('#5A606B', 0.4, 0.5), bevel=0.01)
    cyl('ws_tape', 0.05, 0.03, (0.85, -0.05, 0.84), mat=flat('#F2C230', 0.6), segs=16, bevel=0.006)
    # a stool and a boot pair waiting on the floor (shoes being mended — leather colour, no price tag)
    cyl('ws_stool', 0.16, 0.05, (-0.75, -0.25, 0.48), mat=wood('#A8743F', 0.06), segs=18, bevel=0.012)
    for k in range(3):
        a = math.radians(90 + k * 120)
        L.tube('ws_stool_leg', [(-0.75 + 0.14 * math.cos(a), -0.25 + 0.14 * math.sin(a), 0.08),
                                (-0.75 + 0.09 * math.cos(a), -0.25 + 0.09 * math.sin(a), 0.48)], 0.02, dark)
    for k in range(2):
        box('ws_boot', (0.12, 0.26, 0.09), (-1.05 + k * 0.15, -0.35, 0.08), mat=flat('#6B4226', 0.6), bevel=0.04)
        box('ws_bootleg', (0.12, 0.11, 0.2), (-1.05 + k * 0.15, -0.28, 0.16), mat=flat('#6B4226', 0.6), bevel=0.04)
    # the roof: boards sloping from the back (zb) to the front (zf), snow on top
    ang = math.degrees(math.atan2(zb - zf, D))
    depth = math.hypot(D + 0.3, zb - zf)
    nb = 9
    for i in range(nb):
        x = -W / 2 - 0.15 + (i + 0.5) * (W + 0.3) / nb
        rnd = L.rng(200 + i)
        c = ('#3F6E8C', '#386480', '#46789A')[rnd.randrange(3)]
        box('ws_roof', ((W + 0.3) / nb - 0.012, depth, 0.05), (x, 0.0, (zb + zf) / 2 + 0.04), rot=(-ang, 0, 0),
            mat=tonal(c, 0.06, 5.0, rough=0.75), bevel=0.01, origin='center')
    L.snow_slab('ws_snow', W + 0.35, depth * 0.85, 0.09, (0, 0.05, (zb + zf) / 2 + 0.1), rot=(-ang, 0, 0), seed=12,
                droop=0.04)
    # the blank signboard hanging under the roof's front edge (faces -Y)
    SW, SH = 1.5, 0.3
    sb_z = zf - 0.45
    box('ws_sign_back', (SW + 0.08, 0.05, SH + 0.08), (0.0, -D / 2 + 0.06, sb_z - 0.04), mat=dark, bevel=0.012)
    box('ws_sign', (SW, 0.04, SH), (0.0, -D / 2 + 0.03, sb_z), mat=tonal('#EEDDB8', 0.04, 2.0), bevel=0.008)
    for sx in (-1, 1):
        L.tube('ws_sign_rope', [(sx * (SW / 2 - 0.1), -D / 2 + 0.05, sb_z + SH), (sx * (SW / 2 - 0.1), -D / 2 + 0.08, zf - 0.02)],
               0.012, flat('#D9C39A', 0.85))
    fy = -D / 2 + 0.008
    for (x, z) in ((-SW / 2 + 0.06, sb_z + SH - 0.04), (SW / 2 - 0.06, sb_z + SH - 0.04),
                   (SW / 2 - 0.06, sb_z + 0.04), (-SW / 2 + 0.06, sb_z + 0.04)):
        BA.mark('sign', (x, fy, z))
    PA.lantern('ws_lan', (-W / 2 + 0.1, -D / 2 + 0.05, 1.55), 0.13, 3.0)
    LA.snow_drift('ws_d1', 0.24, (W / 2 + 0.15, 0.3, 0), seed=13)
    L.point_light('ws_lamp', (-W / 2 + 0.1, -D / 2 - 0.1, 1.5), 'glow', 4.0, 0.15)
    return {'frames': [('workshop43', None)], 'sprites': {'workshop43': {'frame': 'workshop43'}},
            'fx': {'lantern': (-W / 2 + 0.1, -D / 2 + 0.05, 1.5)}}
