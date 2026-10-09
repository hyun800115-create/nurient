"""
beach_water.py - Sunny Beach tiles + water-plane props (docs/CONTRACT_V7.md section W), registered into
beach_assets.BEACH.

  * boardwalk_x / boardwalk_y (+ closed ends boardwalk_end_xp/xn/yp/yn): seamless sqrt(2) m tiles over the sand,
    exactly the harbour pier-tile scheme (harbor_water.build_run / tile_res / cuts_for imported read-only): the builder
    models a continuous run, beach_render clips the frame to the tile strip and beach_pack applies the
    partition-of-unity cut at the open ends, so chained tiles composite back into the continuous boardwalk, shadow
    included.  Step (+64, +32) px along X, (+64, -32) along Y.
  * swim_buoy_line_x / _y: the same tile scheme ON THE WATER (waterline = anchor, like assets/ships); bob anim whose
    travelling wave has the tile length as wavelength -> play every tile's anim in sync (same frame index) and the
    line ripples continuously.  swim_buoy_line_end: the big yellow corner / end marker buoy.
  * float_raft: wooden swim platform on four blue barrels, waterline anchor, bob anim.
"""
import math

import bpy  # noqa: F401
from mathutils import Vector, Euler

import prop_lib as L
from prop_lib import flat, box, cyl, sphere, blob
import life2_lib as L2
from bld_assets import mark
import harbor_water as HW          # read-only: build_run / tile_res / cuts_for (harbour pier tiles)
import veh_lib as VL
import beach_lib as B
from beach_assets import beach, loop_frames, anim_entry

SEG = HW.SEG
BW = 1.5                            # boardwalk width (m)
BW_TOP = 0.07                       # deck top above the sand


# =========================================================================== BOARDWALK

def bw_segment(k):
    u0 = k * SEG
    pitch = SEG / 7
    cols = ('#C9A070', '#BE9466', '#D2AB7C', '#C49A6A', '#CCA676', '#BF9568', '#D0A878')
    objs = []
    # planks whose centre (n + 0.5) * pitch lies in [u0 - SEG / 2, u0 + SEG / 2): 7 per segment, so the plank that
    # straddles the cut is built by ONE segment only (building it twice gave coincident faces -> a dark seam plank at
    # every tile join)
    n0, n1 = 7 * k - 4, 7 * k + 3
    for n in range(n0, n1):
        j = n % 7
        rnd = L.rng(31 + j)
        uu = (n + 0.5) * pitch
        ln = BW + rnd.uniform(-0.05, 0.03)
        objs.append(box('pl%d' % n, (pitch - 0.02, ln, 0.04), (uu, rnd.uniform(-0.02, 0.02), BW_TOP - 0.04),
                        rot=(0, 0, rnd.uniform(-0.8, 0.8)), mat=B.teak(cols[j], along='Y'), bevel=0.01))
    edge = B.teak('#8A6A48', along='X')
    for s in (-1, 1):
        objs.append(box('str%d' % k, (SEG, 0.1, 0.06), (u0, s * (BW / 2 - 0.16), -0.02), mat=edge, bevel=0.01))
    # a little drift of sand creeping over the near edge (same in every segment -> periodic)
    objs.append(B.sand_mound('sd%d' % k, 0.22, 0.05, (u0 + 0.3, -BW / 2 - 0.02, 0.0), seed=4, col=B.SAND,
                             scale=(1.6, 0.6, 1)))
    objs.append(B.sand_mound('sd2%d' % k, 0.16, 0.04, (u0 - 0.35, BW / 2 + 0.02, 0.0), seed=6, col=B.SAND,
                             scale=(1.5, 0.6, 1)))
    return objs


def bw_cap(u_end, sgn):
    """Closed end: the planks step down onto the sand with a low ramp and two rope posts."""
    edge = B.teak('#8A6A48', along='Y')
    objs = [box('ramp', (0.42, BW, 0.035), (u_end + sgn * 0.17, 0.0, 0.0), rot=(0, -sgn * 6, 0),
                mat=B.teak('#C49A6A', along='Y'), bevel=0.01),
            box('endb', (0.08, BW + 0.06, 0.07), (u_end - sgn * 0.02, 0.0, 0.0), mat=edge, bevel=0.012)]
    rm = B.rope_mat()
    for s in (-1, 1):
        objs.append(cyl('ep%d' % s, 0.06, 0.6, (u_end - sgn * 0.06, s * (BW / 2 + 0.05), 0.0), mat=edge, segs=12,
                        bevel=0.015, cap_mat=L.end_grain(light='#D9B48A', ring='#B88B5E')))
        mb = L2.MB()
        p0 = Vector((u_end - sgn * 0.06, s * (BW / 2 + 0.05), 0.55))
        p1 = Vector((u_end - sgn * 0.06 - sgn * 0.7, s * (BW / 2 + 0.05), 0.4))
        mb.seg(p0, (p0 + p1) / 2 - Vector((0, 0, 0.06)), 0.016, rm, segs=6)
        mb.seg((p0 + p1) / 2 - Vector((0, 0, 0.06)), p1, 0.016, rm, segs=6)
        objs.append(mb.done('rope%d' % s))
    return objs


BW_NOTE = ('Boardwalk tile (sqrt(2) m along world %s, %.1f m wide, deck 7 cm above the sand): sun-bleached plank deck '
           'on two stringers, a little sand creeping over the edges. Tiles join seamlessly %s px apart (ground layer; '
           'characters walk on it with no lift). %s')
BW_VARIANTS = {
    'boardwalk_x': ('x', (True, True), False, 'Straight piece.'),
    'boardwalk_y': ('y', (True, True), False, 'Straight piece.'),
    'boardwalk_end_xp': ('x', (True, False), True, 'Closed end at +X (screen down-right): low ramp down to the sand '
                                                   'between two rope posts.'),
    'boardwalk_end_xn': ('x', (False, True), True, 'Closed end at -X (screen up-left).'),
    'boardwalk_end_yp': ('y', (True, False), True, 'Closed end at +Y (screen up-right).'),
    'boardwalk_end_yn': ('y', (False, True), True, 'Closed end at -Y (screen down-left, toward the sea).'),
}


def _bw_builder(axis, ends, cap):
    def fn():
        HW.build_run(bw_segment, ends, bw_cap if cap else None)
        res = HW.tile_res(axis, ends, extra={'widthM': BW, 'deckTopM': BW_TOP, 'capKind': 'ramp' if cap else 'none'})
        return res
    return fn


for _k, (_ax, _ends, _cap, _txt) in BW_VARIANTS.items():
    beach(_k, 'decal', 'beach_tiles', fp=(SEG, BW) if _ax == 'x' else (BW, SEG), yaw=0.0 if _ax == 'x' else 90.0,
          catcher=24.0, samples=40, front=None,
          notes=BW_NOTE % (_ax.upper(), BW, '(+64, +32)' if _ax == 'x' else '(+64, -32)', _txt), ko='나무 산책로',
          en='Boardwalk', zone='tiles')(_bw_builder(_ax, _ends, _cap))


# =========================================================================== SWIM BUOY LINE

BOB_N = 4
FLOATS = 4                           # floats per tile (alternating colours -> periodic)


def buoy_segment(k, state):
    """One tile-long piece of the swim-area line along local X at the waterline: rope + 4 sausage floats."""
    u0 = k * SEG
    rm = B.rope_mat('#F4F1EA')
    cols = [B.vinyl('#F26B3A', 0.3, 0.5), B.vinyl('#F7F3EA', 0.3, 0.5)]
    objs = []
    for j in range(FLOATS):
        u = u0 - SEG / 2 + SEG * (j + 0.5) / FLOATS
        o = cyl('fl%d_%d' % (k, j), 0.085, 0.24, (u, 0, 0), rot=(0, 90, 0), mat=cols[j % 2], segs=18,
                origin='center', bevel=0.06)
        f = B.torus('ff%d_%d' % (k, j), 0.16, 0.03, (u, 0, 0.002), mats=[B.foam_mat('ffm%d_%d' % (k, j), 0.6)], M=24,
                    K=6, scale=(1.4, 0.8, 0.3))
        f.visible_shadow = False
        state.append((o, f, u))
        objs += [o, f]
    rope = L2.MB()
    rope.seg((u0 - SEG / 2 - 0.01, 0, 0.0), (u0 + SEG / 2 + 0.01, 0, 0.0), 0.012, rm, segs=6)
    ro = rope.done('rope%d' % k)
    state.append((ro, None, None))
    objs.append(ro)
    return objs


def _buoy_builder(axis):
    def fn():
        state = []
        HW.build_run(lambda k: buoy_segment(k, state), (True, True), None)

        def at(i):
            ph = 0.0 if i is None else math.tau * i / BOB_N
            amp = 0.0 if i is None else 1.0
            for o, f, u in state:
                if u is None:
                    continue
                w = math.sin(ph - math.tau * (u / SEG))
                o.location.z = 0.035 * amp * w
                o.rotation_euler = Euler((math.radians(5 * amp * math.cos(ph - math.tau * u / SEG)),
                                          math.radians(90), 0), 'XYZ')
                s = 1.0 + 0.18 * amp * max(0.0, -w)
                f.scale = (1.4 * s, 0.8 * s, 0.3)
        frames = loop_frames('swim_buoy_line_' + axis, 'bob', BOB_N, at, lambda: at(None))
        at(None)
        res = HW.tile_res(axis, (True, True), extra={'tileLayer': 'water'})
        res.update({'frames': frames, 'anims': anim_entry('swim_buoy_line_' + axis, 'bob', BOB_N, 4)})
        return res
    return fn


BUOY_NOTE = ('Swim-area buoy line tile (sqrt(2) m along world %s): white rope with four orange / white sausage floats '
             'and foam rings, ON THE WATER: anchor = waterline (on the sand beach the sea surface is level with the '
             'sand: waterPx 0; 30 beside quays). Chain tiles %s px apart; play every tile\'s anims.bob (= work) IN '
             'SYNC (same frame index): the wave travels one tile per loop so the line ripples continuously. Cap the ends / corners with swim_buoy_line_end.')
for _ax in ('x', 'y'):
    beach('swim_buoy_line_' + _ax, 'decor', 'beach_water', fp=(SEG, 0.3) if _ax == 'x' else (0.3, SEG),
          yaw=0.0 if _ax == 'x' else 90.0, catcher=20.0, samples=40, front=None, ground='water',
          notes=BUOY_NOTE % (_ax.upper(), '(+64, +32)' if _ax == 'x' else '(+64, -32)'), ko='수영 구역 부표 줄',
          en='Swim buoy line', zone='water', anim_name='bob')(_buoy_builder(_ax))


@beach('swim_buoy_line_end', 'decor', 'beach_water', fp=('r', 0.35), samples=40, catcher=12.0, front=None,
       ground='water', anim_name='bob',
       notes='Big yellow marker buoy that ends / turns the swim-area line (put it on the open end of a buoy-line tile, '
             'or at a corner where an _x and a _y run meet). Waterline anchor; anims.bob (= work) 4 frames (in sync with '
             'the line). ropePoint = where the line ties on.', ko='부표 (끝)', en='Swim line end buoy', zone='water')
def b_buoy_end():
    g = L.group([], 'bg')
    with L.Collect() as c:
        sphere('ball', 0.3, (0, 0, 0.08), B.vinyl('#F7C531', 0.3, 0.5), scale=(1, 1, 0.92), segs=28, rings=16)
        box('band', (0.62, 0.62, 0.08), (0, 0, 0.05), mat=B.vinyl('#F26B3A', 0.3, 0.5), bevel=0.04)
        B.torus('eye', 0.06, 0.015, (0, 0, 0.36), rot=(90, 0, 0), mats=[B.metal('#8E96A3')], M=16, K=6)
        B.rod('pole', (0, 0, 0.3), (0, 0, 0.95), 0.015, B.metal(B.STEEL), segs=8)
        B.flag('fl', (0, 0, 0.94), 0.3, 0.2, ('#F26B3A', '#F7F3EA'), rz=-45, wave=0.04, split='v')
    for o in c.objs:
        if o.parent is None:
            o.parent = g
    foam = B.torus('foam', 0.36, 0.04, (0, 0, 0.003), mats=[B.foam_mat('bfm', 0.75)], M=32, K=6, scale=(1, 1, 0.3))
    foam.visible_shadow = False
    BOB = [(0.0, 0, 0), (0.04, 4, 2), (0.0, 0, 0), (-0.035, -4, -2)]

    def at(i):
        dz, tx, ty = (0, 0, 0) if i is None else BOB[i]
        g.location.z = dz
        g.rotation_euler = (math.radians(tx), math.radians(ty), 0)
        s = 1.0 if i is None else [1.0, 0.92, 1.0, 1.12][i]
        foam.scale = (s, s, 0.3)
    frames = loop_frames('swim_buoy_line_end', 'bob', BOB_N, at, lambda: at(None))
    at(None)
    return {'frames': frames, 'anims': anim_entry('swim_buoy_line_end', 'bob', BOB_N, 4),
            'points': {'rope': (0.0, 0.0, 0.0)}}


# =========================================================================== FLOAT RAFT

@beach('float_raft', 'decor', 'beach_water', fp=(2.0, 2.0), samples=40, catcher=16.0, front=None, ground='water',
       anim_name='bob',
       notes='Swim platform (2 x 2 m) floating on four blue barrels: sun-bleached plank deck 0.35 m above the water, '
             'chrome ladder down the +X side, a life ring and a little pennant. Waterline anchor (sea surface). idle = '
             'still; anims.bob (= work) = 4-frame gentle rock with pulsing foam. playPoints = 4 standing / diving '
             'spots on the deck (height included), ladderPoint = foot of the ladder at the water.',
       ko='물 위 놀이 뗏목', en='Floating raft', zone='water')
def b_raft():
    g = L.group([], 'raftg')
    D = 0.35
    with L.Collect() as c:
        for sx in (-1, 1):
            for sy in (-1, 1):
                cyl('bar', 0.27, 1.6, (sx * 0.52, sy * 0.52, -0.05), rot=(0, 90, 0) if sy > 0 else (90, 0, 0),
                    mat=VL.paint('#2E6FB8', 0.35, 0.4), segs=20, origin='center', bevel=0.05)
        box('frame', (2.0, 2.0, 0.12), (0, 0, D - 0.12), mat=B.teak('#8A6A48', along='X'), bevel=0.02)
        for k in range(10):
            box('pl%d' % k, (2.0, 0.18, 0.04), (0, -0.9 + k * 0.2, D - 0.03), mat=B.teak(
                ['#D2AB7C', '#C9A070', '#CCA676', '#BF9568'][k % 4], along='X'), bevel=0.01)
        ch = B.metal(B.CHROME, 0.18, 0.9)
        for y in (-0.2, 0.2):
            B.rod('lr', (1.0, y, D + 0.55), (1.08, y, -0.3), 0.02, ch, segs=8)
            B.rod('lt', (0.85, y, D), (1.0, y, D + 0.55), 0.02, ch, segs=8)
        for k in range(2):
            B.rod('lg', (1.04, -0.2, 0.15 - k * 0.22), (1.04, 0.2, 0.15 - k * 0.22), 0.015, ch, segs=6)
        B.torus('ring', 0.16, 0.05, (-0.75, -0.75, D + 0.05), mats=[B.vinyl(B.RESCUE_RED, 0.4, 0.3),
                                                                   B.vinyl(B.WHITE, 0.4, 0.3)],
                seg_fn=lambda j, k: (j // 4) % 2)
        B.rod('fp', (-0.85, 0.85, D), (-0.85, 0.85, D + 1.0), 0.015, B.metal(B.STEEL), segs=6)
        B.pennant('pn', (-0.85, 0.85, D + 0.98), 0.32, 0.2, B.YELLOW, rz=-40)
    for o in c.objs:
        if o.parent is None:
            o.parent = g
    foams = []
    for sx in (-1, 1):
        for sy in (-1, 1):
            f = B.torus('fo', 0.33, 0.04, (sx * 0.52, sy * 0.52, 0.004), mats=[B.foam_mat('rfm', 0.65)], M=24, K=6,
                        scale=(1.6 if sy > 0 else 0.9, 0.9 if sy > 0 else 1.6, 0.3))
            f.visible_shadow = False
            foams.append((f, tuple(f.scale)))
    BOB = [(0.0, 0.0, 0.0), (0.025, 2.0, -1.5), (0.0, 0.0, 0.0), (-0.025, -2.0, 1.5)]

    def at(i):
        dz, tx, ty = (0, 0, 0) if i is None else BOB[i]
        g.location.z = dz
        g.rotation_euler = (math.radians(tx), math.radians(ty), 0)
        for k, (f, s0) in enumerate(foams):
            s = 1.0 if i is None else 1.0 + 0.1 * math.sin(math.tau * i / BOB_N + k)
            f.scale = (s0[0] * s, s0[1] * s, 0.3)
    for (x, y) in ((-0.5, -0.4), (0.4, -0.5), (0.45, 0.4), (-0.4, 0.45)):
        mark('play', (x, y, D + 0.01), facing=(0, -1, 0))
    mark('ladder', (1.15, 0.0, 0.0), facing=(-1, 0, 0))
    frames = loop_frames('float_raft', 'bob', BOB_N, at, lambda: at(None))
    at(None)
    return {'frames': frames, 'anims': anim_entry('float_raft', 'bob', BOB_N, 4), 'extra': {'deckM': D}}
