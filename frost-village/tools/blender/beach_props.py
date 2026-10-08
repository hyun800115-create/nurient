"""
beach_props.py - the rest of the Sunny Beach ground props (docs/CONTRACT_V7.md section W), registered into
beach_assets.BEACH (same registry, conventions and markers - see beach_assets.py / beach_lib.py).

Groups (atlas): beach_shade (chairs, booth, swing, picnic table), beach_play (rings, ball, bucket, net, surf rack,
kite), beach_service (rescue gear, shower, carts, stands, signs), beach_nature (palms, pine, dune grass, starfish,
driftwood).
"""
import math

import bpy  # noqa: F401
from mathutils import Vector, Euler

import prop_lib as L
from prop_lib import flat, tonal, box, cyl, sphere, blob, extrude, hexmix
import life2_lib as L2
import bld_assets as BA
from bld_assets import mark
import veh_lib as VL
import town_lib as T
import beach_lib as B
from beach_assets import beach, loop_frames, anim_entry, _empty, castle_s, bucket_spade_pair


def collect_group(fn, name, loc=(0, 0, 0), rot=(0, 0, 0)):
    with L.Collect() as c:
        fn()
    return L.group(BA.top_level(c.objs), name, loc=loc, rot=rot)


# =========================================================================== FOLDING DECK CHAIR

CHAIR_NOTE = ('Folding wooden deck chair (%s): oiled teak frame with brass pivots, a %s striped canvas sling that sags '
              'with the weight lines of real cloth, a little cushion at the head. seatPoints[0] = the sling seat '
              '(villagers `sit` anchor, faces %s).')


def deck_chair(cols=(B.BLUE, B.WHITE), pillow=B.LEMON):
    tk = B.teak(B.TEAK, along='Z')
    brass = B.metal('#D9B45A', 0.3, 0.8)
    mb = L2.MB()
    w = 0.29
    for sx in (-1, 1):
        x = sx * w
        mb.seg((x, 0.36, 0.0), (x, -0.12, 0.98), 0.025, tk, segs=8)          # back legs -> top
        mb.seg((x * 1.06, -0.4, 0.0), (x * 1.06, 0.12, 0.52), 0.024, tk, segs=8)  # front legs
        mb.seg((x * 1.03, -0.36, 0.3), (x * 1.03, 0.24, 0.26), 0.02, tk, segs=8)  # seat rail
        mb.sphere(0.03, brass, loc=(x * 1.07, 0.05, 0.42), segs=10, rings=6)
        mb.sphere(0.028, brass, loc=(x * 1.04, -0.25, 0.29), segs=10, rings=6)
    mb.seg((-w, -0.12, 0.98), (w, -0.12, 0.98), 0.022, tk, segs=8)
    mb.seg((-w * 1.06, -0.36, 0.33), (w * 1.06, -0.36, 0.33), 0.022, tk, segs=8)
    mb.seg((-w, 0.32, 0.06), (w, 0.32, 0.06), 0.02, tk, segs=8)
    mb.done('frame')
    # sling: from the top bar down into a sag and up to the front bar
    st = L.stripes(cols[0], cols[1], count=1.0 / 0.085, axis='X', rough=0.85, soft=0.03)
    path = [Vector((0, -0.12, 0.96)), Vector((0, -0.04, 0.62)), Vector((0, -0.04, 0.34)), Vector((0, -0.2, 0.28)),
            Vector((0, -0.36, 0.33))]
    pts = L2.catmull(path, n=8)
    verts, faces = [], []
    n = 6
    for k, p in enumerate(pts):
        for j in range(n + 1):
            x = -w * 0.93 + 2 * w * 0.93 * j / n
            sag = 0.025 * math.sin(math.pi * j / n)
            verts.append((x, p.y + sag * 0.6, p.z - sag))
    for k in range(len(pts) - 1):
        for j in range(n):
            i0 = k * (n + 1) + j
            faces.append((i0, i0 + 1, i0 + n + 2, i0 + n + 1))
    sl = B.mesh_from('sling', verts, faces, [st])
    B.solidify(sl, 0.012, 0.0)
    sphere('pillow', 0.12, (0, -0.07, 0.86), B.canvas(pillow), scale=(1.7, 0.6, 0.85), rot=(-20, 0, 0), segs=16,
           rings=10)
    mark('seat', (0, -0.33, 0.3), facing=(0, -1, 0))
    return {}


beach('beach_chair_folding', 'decor', 'beach_shade', fp=(0.7, 0.8), samples=40,
      notes=CHAIR_NOTE % ('faces -Y = screen down-left', 'blue-and-white', 'SW'), ko='접이식 비치 의자',
      en='Folding beach chair', zone='shade')(lambda: deck_chair())
beach('beach_chair_folding_x', 'decor', 'beach_shade', fp=(0.7, 0.8), yaw=90.0, samples=40,
      notes=CHAIR_NOTE % ('faces +X = screen down-right', 'coral-and-white', 'SE'), ko='접이식 비치 의자 (X)',
      en='Folding beach chair (X)', zone='shade')(lambda: deck_chair((B.CORAL, B.WHITE), pillow=B.MINT))


# =========================================================================== SWIM RINGS (on the sand)

RING_NOTE = ('Inflatable swim ring lying on the sand (%s), glossy vinyl with seams and a little valve; ~0.75 m across. '
             'Pick-up / decor (the worn ring is a beachfolk part).')


def ring_base(R=0.3, r=0.11, tilt=(8, -6)):
    return Vector((0, 0, r * 0.92)), tilt


@beach('swim_ring_red', 'decor', 'beach_play', fp=('r', 0.38), samples=40, notes=RING_NOTE % 'red and white stripes',
       ko='튜브 (빨강)', en='Swim ring (red)', zone='play')
def b_ring_red():
    m = B.vinyl_stripes(B.RED, B.WHITE, n=8, rough=0.18)
    o = B.torus('ring', 0.3, 0.11, (0, 0, 0.1), mats=[m], M=48, K=18, rot=(7, -5, 12))
    sphere('valve', 0.022, (0.31, -0.1, 0.2), flat(B.WHITE, 0.3), segs=10, rings=6)
    del o
    return {}


@beach('swim_ring_duck', 'decor', 'beach_play', fp=('r', 0.4), samples=40,
       notes=RING_NOTE % 'yellow duck ring with an orange beak and a curly tail', ko='오리 튜브', en='Duck swim ring',
       zone='play')
def b_ring_duck():
    y = B.vinyl('#F7CF3B', 0.2)
    B.torus('ring', 0.3, 0.11, (0, 0, 0.1), mats=[y], M=48, K=18, rot=(6, -4, 0))
    # head at the front (-Y), facing -Y
    hz = 0.3
    sphere('neck', 0.1, (0, -0.33, 0.2), y, scale=(1, 1, 1.3), segs=16, rings=10)
    sphere('head', 0.13, (0, -0.36, hz + 0.06), y, segs=18, rings=12)
    beak = sphere('beak', 0.07, (0, -0.47, hz + 0.03), B.vinyl('#F49A3A', 0.25), scale=(1.1, 1.0, 0.45), segs=14,
                  rings=8)
    del beak
    for sx in (-1, 1):
        sphere('eye%d' % sx, 0.022, (sx * 0.06, -0.47, hz + 0.1), B.vinyl('#1E2026', 0.15), segs=10, rings=6)
        sphere('hl%d' % sx, 0.007, (sx * 0.064, -0.49, hz + 0.11), flat('#FFFFFF', 0.2, emission='#FFFFFF',
                                                                         emission_strength=1.5), segs=6, rings=4)
        sphere('ch%d' % sx, 0.024, (sx * 0.09, -0.45, hz + 0.04), flat('#F7A0A8', 0.5), scale=(0.6, 1, 0.6), segs=8,
               rings=5)
    sphere('tail', 0.07, (0, 0.38, 0.22), y, scale=(1, 1.2, 1.3), rot=(-35, 0, 0), segs=14, rings=8)
    sphere('tailtip', 0.04, (0, 0.43, 0.3), y, rot=(-50, 0, 0), segs=10, rings=6)
    return {}


@beach('swim_ring_donut', 'decor', 'beach_play', fp=('r', 0.38), samples=40,
       notes=RING_NOTE % 'pink frosted donut with sprinkles', ko='도넛 튜브', en='Donut swim ring', zone='play')
def b_ring_donut():
    dough = B.vinyl('#E9B77A', 0.25)
    pink = B.vinyl('#F58FB4', 0.18)
    rot = (5, 6, 20)

    def seg_fn(j, k):
        # frosting on the upper half with a wavy drip edge
        b = 2 * math.pi * k / 18
        drip = 0.35 * math.sin(j * 0.9) + 0.25 * math.sin(j * 2.3)
        return 1 if math.sin(b) > -0.25 + drip * 0.5 else 0
    B.torus('ring', 0.3, 0.115, (0, 0, 0.105), mats=[dough, pink], M=48, K=18, rot=rot, seg_fn=seg_fn)
    mb = L2.MB()
    cols = ['#FFFFFF', '#5BC0EB', '#F7DC6F', '#9BE564', '#B98AE0']
    rnd = L.rng(5)
    for k in range(34):
        a = rnd.uniform(0, math.tau)
        rr = 0.3 + rnd.uniform(-0.06, 0.06)
        p = Vector((rr * math.cos(a), rr * math.sin(a), 0.105 + 0.11))
        p.rotate(Euler([math.radians(v) for v in rot], 'XYZ'))
        mb.cone(0.009, 0.009, 0.04, flat(cols[k % len(cols)], 0.35), loc=tuple(p),
                rot=(90, 0, rnd.uniform(0, 180)), segs=6)
    mb.done('sprinkles')
    return {}


# =========================================================================== BEACH BALL (item + bounce)

def ball_mat(cols=('#E8524A', '#F7F3EA', '#3D86D6', '#F7C948', '#F7F3EA', '#4FB06A')):
    key = ('bball', tuple(cols))
    if key in L._CUSTOM:
        return L._CUSTOM[key]
    nb = L.NB('beachball', rough=0.2)
    tc = nb.n('ShaderNodeTexCoord')
    sep = nb.n('ShaderNodeSeparateXYZ')
    nb.link(tc.outputs['Object'], sep.inputs[0])
    at = nb.math('ARCTAN2', sep.outputs['Y'], sep.outputs['X'])
    v = nb.math('ADD', nb.math('MULTIPLY', at, 1.0 / math.tau), 0.5)
    ramp = nb.n('ShaderNodeValToRGB')
    ramp.color_ramp.interpolation = 'CONSTANT'
    els = ramp.color_ramp.elements
    els[0].position = 0.0
    els[0].color = nb.rgb(cols[0])
    els[1].position = 1.0 / 6
    els[1].color = nb.rgb(cols[1])
    for k in range(2, 6):
        e = els.new(k / 6.0)
        e.color = nb.rgb(cols[k])
    nb.link(v, ramp.inputs['Fac'])
    # white polar caps
    capf = nb.map_range(nb.math('ABSOLUTE', sep.outputs['Z']), 0.82, 0.86)
    col = nb.mix_rgb(capf, ramp.outputs['Color'], '#F7F3EA')
    nb.base(col)
    for nm, val in (('Coat Weight', 0.8), ('Coat Roughness', 0.06)):
        if nm in nb.p.inputs:
            nb.p.inputs[nm].default_value = val
    L._CUSTOM[key] = nb.m
    return nb.m


@beach('beach_ball', 'item', 'beach_play', samples=48, item={'thickness': 0.34}, front=None,
       notes='Beach ball item / icon (72x72, anchor (36,54) like every item): six glossy vinyl gores (red, white, '
             'blue, yellow, white, green) with white caps. For the bouncing ball on the sand use beach_ball_bounce.',
       ko='비치볼', en='Beach ball', zone='play', extra={'carryScale': 0.6})
def b_beach_ball():
    sphere('ball', 0.165, (0, 0, 0.165), ball_mat(), segs=36, rings=20, rot=(28, 0, 20))
    return {}


BOUNCE = 8


@beach('beach_ball_bounce', 'decor', 'beach_play', fp=('r', 0.2), samples=40,
       notes='Beach ball bouncing on the sand: idle = resting on the sand; anims.bounce (= work) = 8-frame loop at 12 '
             'fps (squash on contact frame 0, rise, spin, fall) with its baked shadow shrinking / softening with the '
             'height. Anchor = the contact point on the sand; impactFrame 0 (play sfx_beachball_bounce).',
       ko='통통 비치볼', en='Bouncing beach ball', zone='play', extra={'impactFrame': 0})
def b_ball_bounce():
    r = 0.19
    g = L.group([], 'ballg')
    o = sphere('ball', r, (0, 0, 0), ball_mat(), segs=36, rings=20)
    o.parent = g

    def at(i):
        if i is None:
            g.location = (0, 0, r)
            g.rotation_euler = Euler((math.radians(28), 0, math.radians(20)), 'XYZ')
            g.scale = (1, 1, 1)
            return
        t = i / float(BOUNCE)
        h = 0.9 * math.sin(math.pi * t) ** 1.1
        sq = 0.82 if i == 0 else (0.94 if i in (1, BOUNCE - 1) else 1.0)
        st = 1.0 / math.sqrt(sq)
        if i == 0:
            g.scale = (st, st, sq)
            g.location = (0, 0, r * sq)
        else:
            g.scale = (1.0 / math.sqrt(sq * 1.04), 1.0 / math.sqrt(sq * 1.04), sq * 1.04) if sq < 1 else (0.97, 0.97,
                                                                                                         1.06)
            g.location = (0, 0, r + h)
        g.rotation_euler = Euler((math.radians(28 + 360 * t), 0, math.radians(20)), 'XYZ')
    frames = loop_frames('beach_ball_bounce', 'bounce', BOUNCE, at, lambda: at(None))
    at(None)
    return {'frames': frames, 'anims': anim_entry('beach_ball_bounce', 'bounce', BOUNCE, 12)}


# =========================================================================== BUCKET + SPADE + SAND STAR

@beach('bucket_spade', 'decor', 'beach_play', fp=('r', 0.3), samples=40,
       notes='Toy bucket (red, sand inside) + blue spade stuck in a little heap + a yellow star mould next to the sand '
             'star it just made. Decor; kids play here (playPoints).', ko='양동이와 삽', en='Bucket and spade',
       zone='play')
def b_bucket_spade():
    B.bucket('bk', (-0.1, 0.05, 0.0), r=0.11, h=0.16, col=B.RED)
    B.sand_mound('heap', 0.16, 0.08, (0.17, 0.12, 0), seed=4, col=B.SAND_DAMP)
    B.spade('sp', (0.17, 0.1, 0.24), col='#3D86D6', rot=(-72, 0, -20))
    # star mould (yellow) + the sand star it made
    pts = T.star_pts(0.09, 0.05, 5)
    o = extrude('mould', pts, 0.05, top=B.vinyl(B.YELLOW, 0.25), side=B.vinyl(B.YELLOW, 0.25), bevel=0.012)
    o.location = (0.2, -0.2, 0.0)
    o.rotation_euler = Euler((0, 0, math.radians(15)), 'XYZ')
    o2 = extrude('sstar', pts, 0.045, top=B.sand(B.SAND_DAMP), side=B.sand(B.SAND_DAMP), bevel=0.014)
    o2.location = (-0.12, -0.25, 0.0)
    o2.rotation_euler = Euler((0, 0, math.radians(-8)), 'XYZ')
    mark('play', (0.0, -0.5, 0.0), facing=(0, 1, 0))
    return {}


# =========================================================================== VOLLEYBALL NET

NET_NOTE = ('Beach volleyball net (net along world %s, posts 4.2 m apart, top band 1.9 m high): padded white posts '
            'with blue covers, black mesh with a white top band, red-white antennas, guy ropes to sand pegs. Put it on '
            'the middle line of decal_volleyball_court (%s). playPoints = 2 players a side (facing the net).')


def volley_net():
    post = B.painted(B.WOOD_WHITE)
    pad = VL.paint('#2E6FB8', 0.5, 0.2)
    xs = (-2.1, 2.1)
    for x in xs:
        cyl('post', 0.06, 2.2, (x, 0, 0), mat=post, segs=14, bevel=0.015)
        VL.rbox('pad', (0.2, 0.2, 1.2), (x, 0, 0.1), pad, r=0.07)
        sphere('cap', 0.07, (x, 0, 2.22), post, segs=12, rings=8)
        B.sand_mound('pm', 0.2, 0.06, (x, 0, 0), seed=int(x * 3 + 7))
        sx = 1 if x > 0 else -1
        mb = L2.MB()
        mb.seg((x, 0, 2.05), (x + sx * 0.9, 0, 0.0), 0.008, B.rope_mat('#E9E0CC'), segs=5)
        mb.cone(0.025, 0.006, 0.18, flat('#C9A070', 0.7), loc=(x + sx * 0.9, 0, 0.03), segs=8)
        mb.done('guy')
    # net: a grid mesh 4.0 x 0.8 m (top 1.9), black strings, white top band, sides tapes
    nm = flat('#2B2F3A', 0.7)
    mb = L2.MB()
    x0, x1, z0, z1 = -2.0, 2.0, 1.1, 1.88
    n_x, n_z = 40, 8
    for k in range(n_x + 1):
        x = x0 + (x1 - x0) * k / n_x
        mb.seg((x, 0, z0), (x, 0, z1), 0.006, nm, segs=4)
    for k in range(n_z + 1):
        z = z0 + (z1 - z0) * k / n_z
        mb.seg((x0, 0, z), (x1, 0, z), 0.006, nm, segs=4)
    mb.done('mesh')
    box('band', (4.04, 0.03, 0.07), (0, 0, z1 - 0.01), mat=flat(B.WHITE, 0.6), bevel=0.01)
    box('bandb', (4.04, 0.03, 0.04), (0, 0, z0 - 0.02), mat=flat(B.WHITE, 0.6), bevel=0.008)
    for x in (x0, x1):
        box('tape', (0.05, 0.03, z1 - z0), (x, 0, z0), mat=flat(B.WHITE, 0.6), bevel=0.008)
        st = L.stripes(B.RED, B.WHITE, count=10.0, axis='Z', rough=0.5)
        cyl('ant', 0.01, 0.8, (x, 0, z0 - 0.05), mat=st, segs=8, bevel=0.0)
    mark('play', (-1.0, -1.6, 0.0), facing=(0, 1, 0))
    mark('play', (1.0, -1.6, 0.0), facing=(0, 1, 0))
    mark('play', (-1.0, 1.6, 0.0), facing=(0, -1, 0))
    mark('play', (1.0, 1.6, 0.0), facing=(0, -1, 0))
    return {}


beach('volleyball_net', 'decor', 'beach_play', fp=(4.4, 0.3), samples=40, catcher=16.0,
      notes=NET_NOTE % ('X', 'court long axis along world Y'), ko='비치발리볼 네트', en='Beach volleyball net',
      zone='play', extra={'netAxis': 'x'})(volley_net)
beach('volleyball_net_y', 'decor', 'beach_play', fp=(4.4, 0.3), yaw=90.0, samples=40, catcher=16.0,
      notes=NET_NOTE % ('Y', 'court long axis along world X'), ko='비치발리볼 네트 (Y)',
      en='Beach volleyball net (Y)', zone='play', extra={'netAxis': 'y'})(volley_net)


# =========================================================================== SURFBOARDS

def surf_pts(L_=2.0, W=0.52, nose=0.75, tail=0.3, n=24):
    """Surfboard outline (along Y, nose at +Y)."""
    pts = []
    for k in range(n + 1):
        t = k / n                       # 0 tail -> 1 nose
        y = -L_ / 2 + L_ * t
        w = W / 2 * (math.sin(math.pi * min(1.0, t * 0.92 + 0.04)) ** (nose if t > 0.5 else tail))
        pts.append((w, y))
    right = pts
    left = [(-x, y) for x, y in reversed(pts)]
    return right + left[1:-1]


def surfboard(name, loc, rot, col, stripe=B.WHITE, L_=2.0, W=0.52, fin=True):
    with L.Collect() as c:
        o = extrude(name, surf_pts(L_, W), 0.055, top=VL.paint(col, 0.28, 0.6), side=VL.paint(B.WHITE, 0.3, 0.5),
                    bevel=0.022, segs=3)
        o.location = (0, 0, -0.0275)
        box(name + '_st', (0.07, L_ * 0.8, 0.004), (0, -0.05, 0.027), mat=VL.paint(stripe, 0.3, 0.5), bevel=0.0)
        if fin:
            f = extrude(name + '_fin', [(0, 0), (0.13, 0.0), (0.02, 0.12)], 0.012, top=flat('#2B2F3A', 0.4),
                        side=flat('#2B2F3A', 0.4), bevel=0.003)
            f.rotation_euler = Euler((math.radians(90), 0, math.radians(90)), 'XYZ')
            f.location = (0.006, -L_ / 2 + 0.12, -0.03)
    return L.group(BA.top_level(c.objs), name + '_g', loc=loc, rot=rot)


@beach('surfboard_rack', 'decor', 'beach_play', fp=(2.0, 0.9), samples=40, catcher=16.0,
       notes='Wooden A-frame surfboard rack (2 m along world X) with four boards standing nose-up (turquoise, sunny '
             'yellow, white-blue, coral) and a little bodyboard; a towel on the end post. Belongs by surf_shop '
             '(beach_bld).', ko='서핑보드 거치대', en='Surfboard rack', zone='play')
def b_surf_rack():
    tk = B.teak(B.TEAK, along='X')
    mb = L2.MB()
    for x in (-0.95, 0.95):
        mb.seg((x, -0.35, 0.0), (x, 0.0, 1.1), 0.04, tk, segs=8)
        mb.seg((x, 0.35, 0.0), (x, 0.0, 1.1), 0.04, tk, segs=8)
    mb.done('afr')
    box('top', (2.0, 0.08, 0.08), (0, 0.0, 1.08), mat=tk, bevel=0.015)
    box('lo', (2.0, 0.1, 0.05), (0, -0.25, 0.18), mat=tk, bevel=0.012)
    box('lo2', (2.0, 0.1, 0.05), (0, 0.25, 0.18), mat=tk, bevel=0.012)
    cols = [(B.TURQ, B.WHITE), (B.YELLOW, B.RED), (B.WHITE, B.BLUE), (B.CORAL, B.WHITE)]
    for k, (c1, c2) in enumerate(cols):
        x = -0.66 + k * 0.44
        surfboard('sb%d' % k, (x, -0.22, 1.02), (72 - 4 * k, 6 * (k - 1.5), 0), c1, stripe=c2,
                  L_=1.95 - 0.08 * (k % 2))
    bb = extrude('body', VL.rounded_pts(0.5, 0.95, 0.2), 0.05, top=VL.paint('#9B7BD6', 0.3, 0.5),
                 side=VL.paint(B.WHITE, 0.3, 0.4), bevel=0.02)
    bb.rotation_euler = Euler((math.radians(80), 0, math.radians(8)), 'XYZ')
    bb.location = (1.2, -0.2, 0.0)
    B.towel_roll('tw', (-0.98, -0.02, 1.2), 0.3, B.PINK)
    return {}


# =========================================================================== RESCUE GEAR

@beach('rescue_board', 'decor', 'beach_service', fp=(0.6, 0.6), samples=40,
       notes='Red rescue paddleboard (2.3 m) standing nose-up in a teak cradle with a sand heap: yellow rails, a white '
             'cross and a carry handle; ready for the lifeguard.', ko='구조 보드', en='Rescue board',
       zone='service')
def b_rescue_board():
    surfboard('rb', (0.0, 0.06, 1.18), (82, 0, 0), B.RESCUE_RED, stripe=B.RESCUE_YELLOW, L_=2.3, W=0.6, fin=False)
    # white cross on the face
    B.board_xz('c1', 0.3, 0.08, 0.01, (0.0, -0.06, 1.62), flat(B.WHITE, 0.5), r=0.02, tilt=8)
    B.board_xz('c2', 0.08, 0.3, 0.01, (0.0, -0.065, 1.51), flat(B.WHITE, 0.5), r=0.02, tilt=8)
    tk = B.teak(B.TEAK, along='X')
    box('cr', (0.7, 0.36, 0.12), (0, 0.08, 0.0), mat=tk, bevel=0.02)
    for sx in (-1, 1):
        box('cp', (0.08, 0.08, 0.5), (sx * 0.34, 0.2, 0.0), mat=tk, bevel=0.015)
    box('cb', (0.76, 0.08, 0.08), (0, 0.2, 0.42), mat=tk, bevel=0.015)
    B.sand_mound('m', 0.4, 0.07, (0, 0.05, 0), seed=3)
    return {}


@beach('rescue_buoy_stand', 'decor', 'beach_service', fp=('r', 0.3), samples=40,
       notes='Rescue buoy post: white post with a little red roof cap, a red-white ring buoy hanging on a hook with '
             'its coiled throw rope, and a small red board with a white cross.', ko='구명환 거치대',
       en='Rescue buoy stand', zone='service')
def b_rescue_buoy_stand():
    pm = B.painted(B.WOOD_WHITE)
    box('post', (0.12, 0.12, 1.7), (0, 0.05, 0), mat=pm, bevel=0.02)
    box('cap', (0.24, 0.24, 0.06), (0, 0.05, 1.7), mat=B.painted(B.RESCUE_RED), bevel=0.02, taper=(0.5, 0.5))
    box('red', (0.125, 0.125, 0.18), (0, 0.05, 0.0), mat=B.painted(B.RESCUE_RED), bevel=0.015)
    B.rod('hook', (0, -0.01, 1.3), (0, -0.09, 1.33), 0.012, B.metal('#8E96A3'), segs=8)
    B.torus('ring', 0.21, 0.058, (0, -0.12, 1.1), rot=(90, 0, 0),
            mats=[B.vinyl(B.RESCUE_RED, 0.4, 0.3), B.vinyl(B.WHITE, 0.4, 0.3)], seg_fn=lambda j, k: (j // 4) % 2)
    mb = L2.MB()
    rm = B.rope_mat('#E9E0CC')
    for k in range(3):
        T.ring_seg(mb, (0, -0.12, 1.1), 0.21 + 0.06, 0.011, rm, axis='y', a0=-0.3 + k * 2.1, a1=0.5 + k * 2.1, n=6,
                   segs=5)
    mb.done('grab')
    B.board_xz('sign', 0.26, 0.2, 0.025, (0, -0.02, 0.48), B.painted(B.RESCUE_RED), r=0.03)
    B.board_xz('x1', 0.14, 0.045, 0.01, (0, -0.032, 0.555), flat(B.WHITE, 0.5), r=0.01)
    B.board_xz('x2', 0.045, 0.14, 0.01, (0, -0.033, 0.51), flat(B.WHITE, 0.5), r=0.01)
    B.sand_mound('m', 0.2, 0.05, (0, 0.05, 0), seed=5)
    return {'fx': {'board': (0, -0.04, 0.58)}}


# =========================================================================== BEACH SHOWER (anim water)

SHOWER_N = 4


@beach('beach_shower', 'decor', 'beach_service', fp=(1.0, 1.0), samples=40, catcher=14.0,
       notes='Outdoor beach shower: teak grate on a little platform, a chrome T-post (2.3 m) with two rain heads and a '
             'push button, a low foot tap. idle = off; anims.water (= work) = 4-frame loop: water falls from both heads '
             '(glinting streams + droplets), splashes and a wet sheen on the grate. showerPoints = where a person '
             'stands under each head.', ko='해변 샤워기', en='Beach shower', zone='service', anim_name='water')
def b_shower():
    tk = B.teak(B.TEAK, along='X')
    box('base', (1.0, 1.0, 0.06), (0, 0, 0), mat=B.painted('#C9CED6'), bevel=0.02)
    for k in range(7):
        box('gr%d' % k, (0.9, 0.1, 0.04), (0, -0.39 + k * 0.13, 0.06), mat=tk, bevel=0.01)
    ch = B.metal(B.CHROME, 0.18, 0.9)
    pole_m = VL.paint('#2E86C9', 0.3, 0.5)
    cyl('pole', 0.06, 2.3, (0, 0.38, 0.06), mat=pole_m, segs=18, bevel=0.012)
    cyl('pfoot', 0.11, 0.08, (0, 0.38, 0.06), mat=ch, segs=18, bevel=0.015)
    sphere('ptop', 0.07, (0, 0.38, 2.36), ch, segs=14, rings=8)
    heads = []
    for sx in (-1, 1):
        B.rod('arm%d' % sx, (0, 0.38, 2.28), (sx * 0.36, 0.2, 2.28), 0.03, pole_m, segs=10)
        hp = Vector((sx * 0.36, 0.2, 2.2))
        cyl('head%d' % sx, 0.13, 0.07, tuple(hp), mat=ch, segs=24, r_top=0.07, origin='center', bevel=0.015)
        cyl('rose%d' % sx, 0.115, 0.01, tuple(hp - Vector((0, 0, 0.04))), mat=flat('#9AA6B4', 0.4, 0.6), segs=24,
            origin='center', bevel=0.0)
        heads.append(hp)
    VL.rbox('btn', (0.09, 0.05, 0.12), (0, 0.33, 1.25), B.vinyl(B.BLUE, 0.3), r=0.02)
    B.rod('tap', (0.2, 0.38, 0.06), (0.2, 0.38, 0.5), 0.02, ch, segs=8)
    B.rod('tapn', (0.2, 0.38, 0.48), (0.2, 0.25, 0.45), 0.018, ch, segs=8)
    # water parts (camera-only, hidden in idle)
    wm = B.water_mat('showerw', '#9FDCEB', alpha=0.38, rough=0.03)
    core = B.water_mat('showerc', '#E4F7FC', alpha=0.55, rough=0.03)
    dm = B.water_mat('showerd', '#D7F3FA', alpha=0.9, rough=0.04)
    streams, drops, splashes = [], [], []
    rnd = L.rng(11)
    for hp in heads:
        # a soft translucent cone of falling water + a few brighter strands inside it
        o = cyl('cone', 0.1, hp.z - 0.12, (hp.x, hp.y, 0.1), mat=wm, segs=20, r_top=0.08, bevel=0.0, rot=(0, 0, 0))
        o.visible_shadow = False
        streams.append(o)
        for k in range(4):
            a = math.tau * k / 4 + 0.4
            off = Vector((0.05 * math.cos(a), 0.05 * math.sin(a), 0))
            o = B.rod('st', hp + off - Vector((0, 0, 0.05)), Vector((hp.x, hp.y, 0.12)) + off * 1.8, 0.007, core,
                      segs=6)
            o.visible_shadow = False
            streams.append(o)
        for k in range(8):
            o = sphere('dr', 0.016, tuple(hp), dm, scale=(1, 1, 1.6), segs=8, rings=5)
            o.visible_shadow = False
            drops.append((o, hp, rnd.uniform(0, 1), Vector((rnd.uniform(-0.12, 0.12), rnd.uniform(-0.12, 0.12), 0))))
        for k in range(5):
            o = sphere('sp', 0.025, (hp.x, hp.y, 0.11), dm, segs=8, rings=5)
            o.visible_shadow = False
            splashes.append((o, hp, k))
    sheen = box('sheen', (0.9, 0.9, 0.004), (0, 0, 0.1), mat=B.water_mat('sheen', '#6FB7CF', alpha=0.18, rough=0.03),
                bevel=0.0)
    sheen.visible_shadow = False
    allw = streams + [d[0] for d in drops] + [s[0] for s in splashes] + [sheen]

    def idle():
        BA.show(allw, False)

    def work(i):
        BA.show(allw, True)
        for k, o in enumerate(streams):
            sc = 1.0 + 0.18 * math.sin(i * math.pi / 2 + k * 1.3)
            o.scale = (sc, sc, 1.0)
        for o, hp, ph, d in drops:
            t = (ph + i / float(SHOWER_N)) % 1.0
            o.location = (hp.x + d.x * (0.4 + t), hp.y + d.y * (0.4 + t), hp.z - 0.05 - (hp.z - 0.15) * t * t)
        for o, hp, k in splashes:
            a = math.tau * k / 5 + i * 0.6
            rr = 0.1 + 0.05 * ((i + k) % 2)
            o.location = (hp.x + rr * math.cos(a), hp.y + rr * math.sin(a), 0.12 + 0.04 * ((i + k) % 2))
    idle()
    mark('stand', (-0.34, 0.2, 0.06), facing=(0, -1, 0))
    mark('stand', (0.34, 0.2, 0.06), facing=(0, -1, 0))
    frames = loop_frames('beach_shower', 'water', SHOWER_N, work, idle)
    return {'frames': frames, 'anims': anim_entry('beach_shower', 'water', SHOWER_N, 10)}


# =========================================================================== CHANGING BOOTH

@beach('changing_booth', 'building', 'beach_service', fp=(1.2, 1.2), samples=40,
       notes='Changing booth (1.2 x 1.2 m, 2.4 m): candy-striped turquoise-and-white plank walls, a little peaked '
             'roof with a scalloped trim and a flag, a coral door with a heart cut-out and a "occupied" slider, '
             'towel hooks with a towel on the side. doorPoint = in front of the door (people walk in and fade).',
       ko='탈의실', en='Changing booth', zone='service')
def b_booth():
    W = 1.2
    Hh = 2.0
    stp = L.stripes(B.TURQ, B.WHITE, count=1.0 / 0.2, axis='X', rough=0.6, soft=0.01)
    stp2 = L.stripes(B.TURQ, B.WHITE, count=1.0 / 0.2, axis='Y', rough=0.6, soft=0.01)
    box('walls', (W, W, Hh), (0, 0, 0.08), mat=stp, bevel=0.03)
    # side walls show stripes along Y
    box('wallx', (0.02, W - 0.02, Hh - 0.02), (W / 2 - 0.005, 0, 0.09), mat=stp2, bevel=0.0)
    box('base', (W + 0.12, W + 0.12, 0.1), (0, 0, 0), mat=B.teak(B.TEAK, along='X'), bevel=0.02)
    # roof: pyramid with white trim
    rm = B.painted('#F27B5B')
    box('roof', (W + 0.24, W + 0.24, 0.42), (0, 0, Hh + 0.08), mat=rm, bevel=0.03, taper=(0.12, 0.12))
    mb = L2.MB()
    for k in range(9):
        x = -W / 2 - 0.06 + (W + 0.12) * k / 8
        mb.sphere(0.06, flat(B.WHITE, 0.6), loc=(x, -W / 2 - 0.12, Hh + 0.06), scale=(1, 0.3, 0.9), segs=10,
                  rings=6)
        y = -W / 2 - 0.06 + (W + 0.12) * k / 8
        mb.sphere(0.06, flat(B.WHITE, 0.6), loc=(W / 2 + 0.12, y, Hh + 0.06), scale=(0.3, 1, 0.9), segs=10,
                  rings=6)
    mb.done('trim')
    B.rod('fp', (0, 0, Hh + 0.5), (0, 0, Hh + 0.95), 0.012, B.metal(B.STEEL), segs=6)
    B.pennant('fl', (0, 0, Hh + 0.94), 0.26, 0.16, B.YELLOW, rz=-40)
    # door on the front (-Y): coral, heart cut-out, slider, knob
    dm = B.painted(B.CORAL)
    door = B.board_xz('door', 0.72, 1.7, 0.04, (0, -W / 2 - 0.005, 0.12), dm, r=0.06)
    del door
    pts = T.heart_pts(0.09)
    hrt = extrude('heart', [(x, z + 1.55) for x, z in pts], 0.02, top=flat('#3A2A2A', 0.9), side=flat('#3A2A2A', 0.9),
                  bevel=0.0)
    hrt.rotation_euler = Euler((math.radians(90), 0, 0), 'XYZ')
    hrt.location = (0, -W / 2 - 0.035, 0.0)
    box('slide', (0.2, 0.02, 0.07), (0.12, -W / 2 - 0.05, 1.1), mat=flat('#4FB06A', 0.4), bevel=0.01)
    sphere('knob', 0.035, (0.26, -W / 2 - 0.07, 0.95), B.metal('#D9B45A', 0.3, 0.8), segs=10, rings=6)
    # towel hook on the +X side
    B.rod('hk', (W / 2 + 0.01, -0.2, 1.5), (W / 2 + 0.08, -0.2, 1.52), 0.012, B.metal(B.STEEL), segs=6)
    tw = B.board_xz('towel', 0.32, 0.62, 0.03, (W / 2 + 0.04, -0.2, 0.9), B.canvas(B.YELLOW), r=0.04, rz=90)
    del tw
    for k in range(3):
        box('tws%d' % k, (0.035, 0.34, 0.05), (W / 2 + 0.06, -0.2, 0.98 + k * 0.18), mat=B.canvas(B.WHITE), bevel=0.01)
    mark('door', (0, -W / 2 - 0.45, 0.0), facing=(0, 1, 0))
    return {'fx': {'flag': (0, 0, Hh + 0.9)}}


# =========================================================================== BEACH SWING + PICNIC TABLE

@beach('beach_swing', 'decor', 'beach_shade', fp=(2.4, 1.3), samples=40, catcher=16.0,
       notes='Beach swing: chunky driftwood A-frame (2.4 m wide) with a two-seat teak bench hanging on ropes, a '
             'striped cushion and a little shell garland on the top beam; faces the sea (-Y). seatPoints = 2 '
             'sitters (faces SW).', ko='해변 그네', en='Beach swing', zone='shade')
def b_swing():
    dw = B.teak(B.DRIFT, along='Z')
    mb = L2.MB()
    for x in (-1.15, 1.15):
        mb.seg((x, -0.6, 0.0), (x, 0.0, 2.2), 0.07, dw, segs=10)
        mb.seg((x, 0.6, 0.0), (x, 0.0, 2.2), 0.07, dw, segs=10)
        mb.seg((x, -0.32, 1.0), (x, 0.32, 1.0), 0.04, dw, segs=8)
    mb.done('frame')
    cyl('beam', 0.08, 2.5, (0, 0.0, 2.22), rot=(0, 90, 0), mat=dw, segs=14, origin='center', bevel=0.02)
    tk = B.teak(B.TEAK, along='X')
    z = 0.5
    box('seat', (1.2, 0.45, 0.06), (0, -0.05, z), mat=tk, bevel=0.015)
    box('back', (1.2, 0.06, 0.5), (0, 0.17, z + 0.02), rot=(-12, 0, 0), mat=tk, bevel=0.015)
    for sx in (-1, 1):
        box('arm', (0.06, 0.45, 0.05), (sx * 0.58, -0.05, z + 0.28), mat=tk, bevel=0.012)
        box('armp', (0.05, 0.05, 0.28), (sx * 0.58, -0.25, z), mat=tk, bevel=0.012)
    B.cushion_pad('cu', 1.1, 0.4, 0.06, (0, -0.06, z + 0.06), (B.CORAL, B.WHITE))
    mbr = L2.MB()
    rm = B.rope_mat()
    for sx in (-1, 1):
        for y in (-0.22, 0.15):
            mbr.seg((sx * 0.56, y, z + 0.04), (sx * 0.56, 0.0, 2.16), 0.014, rm, segs=6)
    mbr.done('ropes')
    mbs = L2.MB()
    for k in range(9):
        x = -1.0 + k * 0.25
        B.shell(mbs, (x, -0.09, 2.02 - 0.06 * math.sin(math.pi * k / 8)), s=0.05,
                col=['#F7C6CF', '#FFFFFF', '#F9D9A8'][k % 3], rz=90, kind='scallop')
    mbs.done('garland')
    for sx in (-1, 1):
        mark('seat', (sx * 0.28, -0.25, z + 0.06), facing=(0, -1, 0))
    return {}


@beach('picnic_table_beach', 'decor', 'beach_shade', fp=(1.8, 1.6), samples=40, catcher=16.0,
       notes='Beach picnic table: weathered teak table with attached benches, a blue-and-white parasol through the '
             'middle, a pitcher of lemonade and two cups. seatPoints: 2 on the +Y bench (face SW, sit frames) and 2 '
             'on the -Y bench (face NE = backs: draw an idle NE frame at seatsStand or skip); seatDirs per seat.',
       ko='해변 피크닉 테이블', en='Beach picnic table', zone='shade')
def b_picnic():
    tk = B.teak('#B98458', along='X')
    for k in range(4):
        box('tt%d' % k, (1.6, 0.17, 0.05), (0, -0.27 + k * 0.18, 0.72), mat=tk, bevel=0.012)
    for sy in (-1, 1):
        for k in range(2):
            box('bt%d%d' % (sy, k), (1.6, 0.14, 0.04), (0, sy * (0.62 + k * 0.15) - sy * 0.07, 0.42), mat=tk,
                bevel=0.01)
    mb = L2.MB()
    for sx in (-0.65, 0.65):
        mb.seg((sx, -0.8, 0.0), (sx, 0.25, 0.73), 0.035, tk, segs=6)
        mb.seg((sx, 0.8, 0.0), (sx, -0.25, 0.73), 0.035, tk, segs=6)
        mb.seg((sx, -0.82, 0.42), (sx, 0.82, 0.42), 0.03, tk, segs=6)
    mb.done('legs')
    P = B.parasol('pp', [B.BLUE, B.WHITE], R=0.85, apex=2.15, drop=0.32, seed=4)
    for o in P['objs']:
        if o.name.startswith('pp_mound'):
            o.hide_render = True
    # lemonade pitcher + cups
    cyl('pitcher', 0.07, 0.2, (0.3, 0.05, 0.77), mat=B.water_mat('lemon', '#F9E27A', alpha=0.85), segs=16,
        bevel=0.01)
    for k, (x, y) in enumerate(((-0.3, -0.1), (-0.1, 0.14))):
        cyl('cup%d' % k, 0.04, 0.09, (x, y, 0.77), mat=B.vinyl([B.PINK, B.MINT][k], 0.3), segs=14, bevel=0.008)
    for x in (-0.4, 0.4):
        mark('seat', (x, 0.5, 0.45), facing=(0, -1, 0))
        mark('seat', (x, -0.5, 0.45), facing=(0, 1, 0))
    return {}


# =========================================================================== FOOD CARTS / STANDS

CART_N = 4


@beach('icecream_cart', 'station', 'beach_service', fp=(1.6, 0.9), samples=48, catcher=16.0,
       notes='Ice-cream cart: pastel mint cart on two spoked wheels with a push handle, two round freezer lids, a cone '
             'rack, a giant strawberry cone on the roof, a pink-and-white umbrella and a brass bell. idle = still; '
             'anims.bell (= work) = 4-frame bell ring (swinging + a little glint) when calling customers '
             '(sfx_icecream_bell). staffPoints[0] = the vendor behind the cart (+Y, faces SW), customerPoints = '
             'queue in front (-Y side, first at the counter, facing NE), fxPoints.bell.', ko='아이스크림 수레',
       en='Ice-cream cart', zone='service', anim_name='bell')
def b_icecream_cart():
    mint = VL.paint('#9FE3C8', 0.35, 0.45)
    cream = VL.paint('#FFF4DC', 0.4, 0.3)
    pink = VL.paint('#F58FB4', 0.35, 0.4)
    VL.rbox('body', (1.3, 0.7, 0.62), (0, 0, 0.3), mint, r=0.1)
    VL.rbox('band', (1.32, 0.72, 0.1), (0, 0, 0.62), pink, r=0.05)
    VL.rbox('top', (1.34, 0.74, 0.06), (0, 0, 0.92), cream, r=0.03)
    # scalloped skirt trim (front)
    mb = L2.MB()
    for k in range(9):
        x = -0.6 + k * 0.15
        mb.sphere(0.06, VL.paint('#FFF4DC', 0.4, 0.2), loc=(x, -0.36, 0.33), scale=(1, 0.3, 0.8), segs=10, rings=6)
    mb.done('scal')
    # front decal: a big painted cone emblem
    cone_pts = [(-0.11, 0.08), (0.11, 0.08), (0.0, -0.18)]
    o = extrude('emc', cone_pts, 0.01, top=flat('#E8B464', 0.6), side=flat('#E8B464', 0.6), bevel=0.0)
    o.rotation_euler = Euler((math.radians(90), 0, 0), 'XYZ')
    o.location = (0, -0.355, 0.62)
    sphere('ems', 0.1, (0, -0.36, 0.73), flat('#F58FB4', 0.6), scale=(1, 0.12, 0.85), segs=16, rings=8)
    # freezer lids
    for x in (-0.3, 0.12):
        cyl('lid', 0.17, 0.05, (x, 0.05, 0.98), mat=B.metal(B.CHROME, 0.2, 0.85), segs=24, bevel=0.015)
        sphere('lidk', 0.03, (x, 0.05, 1.04), B.metal(B.CHROME, 0.2, 0.85), segs=10, rings=6)
    # cone rack with cones
    box('rack', (0.24, 0.12, 0.12), (0.47, -0.2, 0.98), mat=cream, bevel=0.02)
    for k in range(3):
        cyl('cn%d' % k, 0.025, 0.12, (0.4 + k * 0.07, -0.2, 1.06), mat=flat('#E2AC5C', 0.7), segs=10, r_top=0.035,
            bevel=0.004, rot=(180, 0, 0))
    # wheels + handle
    for sy in (-1, 1):
        o = cyl('wh%d' % sy, 0.24, 0.07, (-0.35, sy * 0.4, 0.24), rot=(90, 0, 0), mat=B.painted('#F58FB4'), segs=28,
                origin='center', bevel=0.02, cap_mat=VL.paint('#FFF4DC', 0.4, 0.2))
        del o
        mbw = L2.MB()
        for k in range(8):
            a = math.tau * k / 8
            mbw.seg((-0.35, sy * 0.44, 0.24), (-0.35 + 0.18 * math.cos(a), sy * 0.44, 0.24 + 0.18 * math.sin(a)), 0.012,
                    flat(B.WHITE, 0.5), segs=5)
        mbw.done('spokes%d' % sy)
    box('leg', (0.06, 0.4, 0.3), (0.5, 0, 0.0), mat=B.painted('#F58FB4'), bevel=0.02)
    B.rod('hd1', (0.62, -0.28, 0.6), (0.92, -0.28, 0.82), 0.022, B.metal(B.CHROME, 0.2, 0.85), segs=8)
    B.rod('hd2', (0.62, 0.28, 0.6), (0.92, 0.28, 0.82), 0.022, B.metal(B.CHROME, 0.2, 0.85), segs=8)
    B.rod('hd3', (0.92, -0.3, 0.82), (0.92, 0.3, 0.82), 0.03, VL.paint('#2E6FB8', 0.4, 0.3), segs=10)
    # umbrella (pink / white) on a pole
    P = B.parasol('um', ['#F58FB4', B.WHITE], R=0.75, apex=2.35, drop=0.28, seed=7)
    for o in P['objs']:
        if o.name.startswith('um_mound'):
            o.hide_render = True
        elif o.name.startswith('um_pole'):
            pass
    # giant cone on the roof (strawberry scoop + cherry)
    cyl('gc', 0.08, 0.32, (-0.48, 0.12, 0.95 + 0.34), rot=(180, 0, 0), mat=flat('#E2AC5C', 0.7), segs=16,
        r_top=0.015, bevel=0.01)
    sphere('gs', 0.12, (-0.48, 0.12, 1.38), VL.paint('#F58FB4', 0.45, 0.3), segs=18, rings=12)
    sphere('gc2', 0.035, (-0.48, 0.12, 1.51), VL.paint(B.RED, 0.25, 0.6), segs=10, rings=6)
    # bell (hangs from the umbrella pole)
    bell_g = L.group([], 'bellg', loc=(0.06, -0.08, 1.75))
    with L.Collect() as bc_:
        T.bell_model('bell', s=0.35, col='#E2B33C')
    for o in BA.top_level(bc_.objs):
        o.parent = bell_g
    B.rod('bstr', (0.06, -0.02, 1.95), (0.06, -0.08, 1.78), 0.006, B.rope_mat(), segs=5)
    SW = [0.0, 22.0, 0.0, -22.0]

    def idle():
        bell_g.rotation_euler = (0, 0, 0)

    def work(i):
        bell_g.rotation_euler = (math.radians(SW[i]), math.radians(SW[i] * 0.4), 0)
    mark('staff', (0.0, 0.62, 0.0), facing=(0, -1, 0))
    for k in range(3):
        mark('customer', (-0.1 + k * 0.05, -0.75 - k * 0.7, 0.0), facing=(0, 1, 0))
    frames = loop_frames('icecream_cart', 'bell', CART_N, work, idle)
    idle()
    return {'frames': frames, 'anims': anim_entry('icecream_cart', 'bell', CART_N, 8),
            'fx': {'bell': (0.06, -0.08, 1.7), 'sign': (-0.48, 0.12, 1.45)}, 'extra': {'staffDepth': 'front'}}


@beach('corn_stand', 'station', 'beach_service', fp=(1.8, 1.0), samples=48, catcher=16.0,
       notes='Grilled corn & hot-dog stand: teak stall with a yellow-and-red striped awning, a charcoal grill with '
             'corn cobs (char marks, butter shine) and sausages on sticks, a basket of fresh cobs, a mustard / ketchup '
             'pair and a blank menu board. idle = coals dark; anims.work (= grill) = 4-frame loop: glowing coals, '
             'rising smoke puffs. staffPoints[0] = cook behind the grill (faces SW), customerPoints = in front.',
       ko='옥수수·핫도그 노점', en='Corn & hot-dog stand', zone='service', anim_name='grill')
def b_corn_stand():
    tk = B.teak(B.TEAK, along='X')
    box('counter', (1.7, 0.75, 0.85), (0, 0.05, 0), mat=tk, bevel=0.03)
    box('ctop', (1.8, 0.85, 0.06), (0, 0.05, 0.85), mat=B.painted('#F2EEE6'), bevel=0.02)
    for sx in (-1, 1):
        box('post%d' % sx, (0.08, 0.08, 1.4), (sx * 0.82, 0.4, 0.9), mat=tk, bevel=0.015)
    box('postf', (0.06, 0.06, 1.25), (-0.82, -0.32, 0.9), mat=tk, bevel=0.012)
    box('postf2', (0.06, 0.06, 1.25), (0.82, -0.32, 0.9), mat=tk, bevel=0.012)
    import prop_assets as PA
    PA.awning(1.9, 1.0, 2.3, 2.0, 0.45, -0.55, c1='#F7C948', c2='#E8524A', stripes_n=9, snow=False, name='aw')
    # grill
    gx = -0.3
    box('grill', (0.8, 0.45, 0.12), (gx, 0.0, 0.91), mat=flat('#3A3E46', 0.5, 0.4), bevel=0.02)
    coal_m = L.emissive('coal', '#3A2A24', '#FF7A2A', 0.0)
    mb = L2.MB()
    rnd = L.rng(3)
    for k in range(20):
        mb.ico(0.035, coal_m, loc=(gx + rnd.uniform(-0.33, 0.33), rnd.uniform(-0.17, 0.17), 1.01), subdiv=1)
    mb.done('coals')
    mbg = L2.MB()
    for k in range(9):
        x = gx - 0.36 + k * 0.09
        mbg.seg((x, -0.2, 1.05), (x, 0.2, 1.05), 0.007, B.metal('#8E96A3', 0.35, 0.7), segs=5)
    mbg.done('grate')
    corn = flat('#F7CF3B', 0.45)
    husk = flat('#B9CF6A', 0.7)
    char_ = flat('#8A5A24', 0.6)
    for k in range(4):
        x = gx - 0.27 + k * 0.17
        o = cyl('corn%d' % k, 0.045, 0.32, (x, 0.0, 1.1), rot=(90, 0, 0), mat=corn, segs=14, origin='center',
                bevel=0.03)
        del o
        for j in range(3):
            box('cm%d%d' % (k, j), (0.02, 0.04, 0.01), (x, -0.09 + j * 0.09, 1.145), mat=char_, bevel=0.004)
        sphere('hk%d' % k, 0.04, (x, 0.18, 1.1), husk, scale=(0.8, 1.6, 0.8), segs=10, rings=6)
    for k in range(3):
        x = 0.25 + k * 0.12
        cyl('dog%d' % k, 0.03, 0.22, (x, -0.1, 1.0), rot=(70, 0, 0), mat=flat('#C25A3A', 0.45), segs=12,
            origin='center', bevel=0.02)
        B.rod('stk%d' % k, (x, -0.04, 0.88), (x, -0.22, 1.0), 0.006, flat('#E9D9B8', 0.6), segs=5)
    cyl('bkt', 0.17, 0.18, (0.55, 0.2, 0.91), mat=B.teak('#C9A070', along='Z'), segs=18, r_top=0.2, bevel=0.015)
    for k in range(5):
        a = math.tau * k / 5
        cyl('fc%d' % k, 0.04, 0.24, (0.55 + 0.07 * math.cos(a), 0.2 + 0.07 * math.sin(a), 1.13), rot=(30, 0, a * 57),
            mat=husk, segs=10, origin='center', bevel=0.02)
    cyl('must', 0.035, 0.16, (0.15, 0.25, 0.91), mat=B.vinyl(B.YELLOW, 0.3), segs=12, bevel=0.01)
    cyl('ketch', 0.035, 0.16, (0.08, 0.27, 0.91), mat=B.vinyl(B.RED, 0.3), segs=12, bevel=0.01)
    B.board_xz('menu', 0.6, 0.4, 0.03, (0.45, -0.43, 0.25), B.painted('#2E3A2E'), r=0.03, tilt=8)
    B.board_xz('menuf', 0.66, 0.46, 0.02, (0.45, -0.42, 0.22), B.teak(B.TEAK, along='X'), r=0.03, tilt=8)
    smoke = L.Smoke('smk', (gx, 0.0, 1.15), n=3, rise=0.9, drift=(0.15, 0.1), r0=0.08, r1=0.22, seed=5)

    def idle():
        smoke.show(False)
        L.set_emission(coal_m, 0.0)

    def work(i):
        smoke.set(i, CART_N)
        L.set_emission(coal_m, [2.2, 3.4, 2.6, 3.8][i])
    mark('staff', (-0.3, 0.75, 0.0), facing=(0, -1, 0))
    for k in range(3):
        mark('customer', (-0.2 + k * 0.4, -0.95, 0.0), facing=(0, 1, 0))
    frames = loop_frames('corn_stand', 'grill', CART_N, work, idle)
    idle()
    return {'frames': frames, 'anims': anim_entry('corn_stand', 'grill', CART_N, 8),
            'fx': {'smoke': (gx, 0.0, 1.4), 'board': (0.45, -0.46, 0.45)}, 'extra': {'staffDepth': 'behind'}}


@beach('rental_stand', 'station', 'beach_service', fp=(2.2, 1.2), samples=48, catcher=16.0,
       notes='Rental stand (튜브·파라솔 대여): a little teak kiosk with a blue-and-white striped roof, a counter with a '
             'cash box and a bell, a peg rack of stacked swim rings (red, yellow, pink, mint), folded parasols in a '
             'barrel, two stacked loungers and a blank price board. staffPoints[0] = clerk behind the counter (faces '
             'SW), customerPoints = in front, fxPoints.board.', ko='대여소', en='Rental stand', zone='service')
def b_rental_stand():
    tk = B.teak(B.TEAK, along='X')
    box('kiosk', (1.1, 0.9, 0.95), (-0.35, 0.1, 0), mat=tk, bevel=0.03)
    box('ktop', (1.2, 1.0, 0.06), (-0.35, 0.1, 0.95), mat=B.painted('#F2EEE6'), bevel=0.02)
    for sx in (-1, 1):
        box('kp%d' % sx, (0.08, 0.08, 1.35), (-0.35 + sx * 0.52, 0.52, 0.95), mat=tk, bevel=0.015)
        box('kpf%d' % sx, (0.07, 0.07, 1.2), (-0.35 + sx * 0.52, -0.3, 0.95), mat=tk, bevel=0.012)
    import prop_assets as PA
    PA.awning(1.35, 1.1, 2.35, 2.1, 0.62, -0.5, c1='#3D86D6', c2='#FFFFFF', stripes_n=8, snow=False, name='aw',
              x=-0.35)
    VL.rbox('cash', (0.26, 0.2, 0.12), (-0.55, 0.0, 1.0), VL.paint('#2E6FB8', 0.4, 0.3), r=0.03)
    cyl('dbell', 0.05, 0.05, (-0.2, -0.15, 1.0), mat=B.metal('#E2B33C', 0.25, 0.85), segs=16, r_top=0.02, bevel=0.01)
    # ring rack: a pole with stacked rings
    cyl('rpole', 0.03, 1.5, (0.55, 0.2, 0), mat=B.painted(B.WOOD_WHITE), segs=10, bevel=0.01)
    cyl('rbase', 0.22, 0.06, (0.55, 0.2, 0), mat=B.painted(B.WOOD_WHITE), segs=20, bevel=0.015)
    cols = ['#E8524A', '#F7C948', '#F58FB4', '#7CD6B8', '#3D86D6']
    for k, c in enumerate(cols):
        B.torus('rr%d' % k, 0.24, 0.085, (0.55 + 0.02 * math.sin(k), 0.2, 0.15 + k * 0.17),
                mats=[B.vinyl_stripes(c, B.WHITE, n=6)], M=36, K=14, rot=(4 * math.sin(k * 2), 3 * math.cos(k), 0))
    # barrel of folded parasols
    cyl('barrel', 0.2, 0.5, (1.05, -0.15, 0), mat=B.teak('#B98458', along='Z'), segs=18, bevel=0.02)
    for k, c in enumerate([B.RED, B.BLUE, B.YELLOW, B.GREEN]):
        a = math.tau * k / 4 + 0.4
        x, y = 1.05 + 0.07 * math.cos(a), -0.15 + 0.07 * math.sin(a)
        B.rod('fp%d' % k, (x, y, 0.3), (x + 0.05 * math.cos(a), y + 0.05 * math.sin(a), 1.75), 0.016,
              B.painted(B.WOOD_WHITE), segs=6)
        cyl('fu%d' % k, 0.07, 0.75, (x + 0.03 * math.cos(a), y + 0.03 * math.sin(a), 0.95), mat=B.canvas(c), segs=10,
            r_top=0.025, bevel=0.01, rot=(math.degrees(0.04 * math.sin(a)), math.degrees(0.04 * math.cos(a)), 0))
    # two stacked loungers (simple)
    for k in range(2):
        box('ls%d' % k, (0.62, 1.6, 0.06), (-1.25, 0.15, 0.06 + k * 0.1), mat=B.painted(B.WOOD_WHITE), bevel=0.02)
        box('lc%d' % k, (0.56, 1.5, 0.04), (-1.25, 0.15, 0.12 + k * 0.1),
            mat=L.stripes(B.TURQ, B.WHITE, count=1.0 / 0.1, axis='X', rough=0.85), bevel=0.015)
    B.board_xz('board', 0.55, 0.45, 0.03, (-0.35, -0.37, 0.22), B.painted('#2E3A2E'), r=0.03, tilt=6)
    B.board_xz('boardf', 0.61, 0.51, 0.02, (-0.35, -0.36, 0.19), B.teak(B.TEAK, along='X'), r=0.03, tilt=6)
    mark('staff', (-0.35, 0.82, 0.0), facing=(0, -1, 0))
    for k in range(2):
        mark('customer', (-0.35 + k * 0.5, -0.85, 0.0), facing=(0, 1, 0))
    return {'fx': {'board': (-0.35, -0.42, 0.45)}, 'extra': {'staffDepth': 'behind'}}


# =========================================================================== SIGNS (blank boards)

SIGN_NOTE = 'Blank beach sign (%s). The game writes the text at fxPoints.board (centre of the board face).'


@beach('beach_sign_arrow', 'decor', 'beach_service', fp=('r', 0.3), samples=40,
       notes=SIGN_NOTE % 'driftwood post with three pastel arrow boards pointing different ways, a starfish on top',
       ko='해변 화살표 표지판', en='Beach arrow sign', zone='service')
def b_sign_arrow():
    dw = B.teak(B.DRIFT, along='Z')
    cyl('post', 0.06, 1.9, (0, 0, 0), mat=dw, segs=12, bevel=0.015)
    boards = []
    for k, (z, col, rz, flip) in enumerate(((1.55, B.TURQ, 10, 1), (1.25, B.CORAL, -35, -1), (0.95, B.YELLOW, 60, 1))):
        pts = [(-0.05, -0.09), (0.42, -0.09), (0.52, 0.0), (0.42, 0.09), (-0.05, 0.09)]
        if flip < 0:
            pts = [(-x, y) for x, y in reversed(pts)]
        o = extrude('arrow%d' % k, pts, 0.035, top=B.painted(col), side=B.painted(hexmix(col, '#3A2A22', 0.2)),
                    bevel=0.01)
        o.rotation_euler = Euler((math.radians(90), 0, math.radians(rz)), 'XYZ')
        o.location = (0, 0.02, z)
        boards.append(o)
    B.starfish('star', (0, 0, 1.9), r=0.09, col='#F49A5A', rz=20, t=0.035, tilt=(0, 0))
    B.sand_mound('m', 0.2, 0.05, (0, 0, 0), seed=2)
    return {'fx': {'board': (0.2, -0.03, 1.55)}}


@beach('beach_sign_board', 'decor', 'beach_service', fp=('r', 0.3), samples=40,
       notes=SIGN_NOTE % 'a turquoise surfboard stuck nose-up in the sand as a sign board, with a hibiscus flower',
       ko='서핑보드 표지판', en='Surfboard sign', zone='service')
def b_sign_board():
    surfboard('sb', (0, 0.0, 0.92), (88, 0, 0), B.TURQ, stripe=B.WHITE, L_=1.8, W=0.6, fin=False)
    B.board_xz('panel', 0.42, 0.55, 0.012, (0, -0.06, 0.6), flat('#FFF8EC', 0.6), r=0.04)
    for k in range(5):
        a = math.tau * k / 5
        sphere('pet%d' % k, 0.05, (0.2 + 0.05 * math.cos(a), -0.07, 1.42 + 0.05 * math.sin(a)), flat('#F2577A', 0.5),
               scale=(1, 0.4, 1), segs=10, rings=6)
    sphere('pc', 0.025, (0.2, -0.09, 1.42), flat(B.YELLOW, 0.5), segs=8, rings=5)
    B.sand_mound('m', 0.3, 0.08, (0, 0, 0), seed=3)
    return {'fx': {'board': (0, -0.07, 0.87)}}


@beach('beach_sign_notice', 'decor', 'beach_service', fp=(1.2, 0.3), samples=40,
       notes=SIGN_NOTE % 'framed notice board on two white posts under a little coral roof (rules / opening hours)',
       ko='해변 안내판', en='Beach notice board', zone='service')
def b_sign_notice():
    pm = B.painted(B.WOOD_WHITE)
    for sx in (-1, 1):
        box('p%d' % sx, (0.08, 0.08, 1.85), (sx * 0.55, 0, 0), mat=pm, bevel=0.015)
    B.board_xz('frame', 1.12, 0.78, 0.05, (0, 0.03, 0.82), B.teak(B.TEAK, along='X'), r=0.03)
    B.board_xz('face', 1.0, 0.66, 0.012, (0, -0.0, 0.88), flat('#FFF8EC', 0.6), r=0.02)
    box('roof', (1.32, 0.34, 0.06), (0, 0.0, 1.82), rot=(0, 0, 0), mat=B.painted(B.CORAL), bevel=0.02,
        taper=(0.9, 0.5))
    box('roof2', (1.32, 0.34, 0.08), (0, 0.0, 1.78), mat=B.painted(B.CORAL), bevel=0.02)
    for sx in (-1, 1):
        B.sand_mound('m%d' % sx, 0.14, 0.04, (sx * 0.55, 0, 0), seed=4 + sx)
    return {'fx': {'board': (0, -0.02, 1.21)}}


# =========================================================================== KITE (flying)

KITE_N = 6


@beach('kite', 'decor', 'beach_play', fp=None, shadow=False, samples=40, front=None,
       notes='Diamond kite in four colours with cross spars and a bow tail. NO baked shadow (it flies): anchor = the '
             'bridle point where the string attaches; fly it ~5-7 m above the kid holding it (draw a thin line from '
             'the hand to the anchor + optionally a soft small shadow on the sand). anims.fly (= work) = 6-frame '
             'loop: the kite pitches / rolls, the tail ripples.', ko='연', en='Kite', zone='play', anim_name='fly')
def b_kite():
    g = L.group([], 'kiteg')
    cols = [B.RED, B.YELLOW, B.BLUE, B.GREEN]
    pts = [(0, 0.55), (0.38, 0.12), (0, -0.62), (-0.38, 0.12)]
    c = (0.0, 0.12)
    with L.Collect() as kc:
        for k in range(4):
            a, b_ = pts[k], pts[(k + 1) % 4]
            o = B.mesh_from('kp%d' % k, [(a[0], 0, a[1]), (b_[0], 0, b_[1]), (c[0], 0, c[1])], [(0, 1, 2)],
                            [B.canvas(cols[k])], smooth=False)
            B.solidify(o, 0.008)
        sm = flat('#C9A070', 0.6)
        mb = L2.MB()
        mb.seg((0, -0.01, 0.55), (0, -0.01, -0.62), 0.008, sm, segs=5)
        mb.seg((-0.38, -0.01, 0.12), (0.38, -0.01, 0.12), 0.008, sm, segs=5)
        mb.done('spars')
    for o in BA.top_level(kc.objs):
        o.parent = g
    tail = []
    for k in range(7):
        t = L.group([], 'tb%d' % k)
        t.parent = g
        with L.Collect() as tc:
            L2.bow('bw', (0, 0, 0), 0.06, L2.satin([B.RED, B.YELLOW, B.BLUE][k % 3]), tails=0.0)
        for o in BA.top_level(tc.objs):
            o.parent = t
        tail.append(t)
    tail_line = []
    rm = B.rope_mat('#F4F1EA')

    def at(i):
        if i is None:
            ph = 0.0
        else:
            ph = math.tau * i / KITE_N
        g.rotation_euler = Euler((math.radians(-25 + 6 * math.sin(ph)), math.radians(8 * math.sin(ph + 1.0)),
                                  math.radians(45 + 5 * math.cos(ph))), 'XYZ')
        prev = Vector((0, 0, -0.62))
        pts3 = [prev]
        for k, t in enumerate(tail):
            d = (k + 1) * 0.2
            p = Vector((0.12 * math.sin(ph - k * 0.9) * (k + 1) / 7.0 * 1.6, 0.0, -0.62 - d))
            t.location = p
            t.rotation_euler = (0, math.radians(25 * math.sin(ph - k * 0.9)), 0)
            pts3.append(p)
        for o in tail_line:
            bpy.data.objects.remove(o)
        tail_line.clear()
        mb = L2.MB()
        for p, q in zip(pts3, pts3[1:]):
            mb.seg(p, q, 0.005, rm, segs=4)
        o = mb.done('tail')
        o.parent = g
        tail_line.append(o)
    g.location = (0, 0, 0.0)
    frames = loop_frames('kite', 'fly', KITE_N, at, lambda: at(None))
    at(None)
    return {'frames': frames, 'anims': anim_entry('kite', 'fly', KITE_N, 8), 'extra': {'stringPoint': [0, 0],
                                                                                       'flyHeightM': [5, 7]}}


# =========================================================================== NATURE: PALMS, PINE, GRASS, DRIFT

def frond(mb, base, direction, length=1.6, width=0.34, droop=0.9, lift=0.35, mats=None, n=16, seed=0, fold=0.35):
    """Palm frond into a life2_lib.MB-like vertex list: a V-folded leaf strip along a drooping arc with a serrated
    (leaflet) edge.  Returns (verts, faces, fmat) chunk appended to mb lists."""
    d = Vector((direction[0], direction[1], 0)).normalized()
    side = Vector((-d.y, d.x, 0))
    verts, faces, fm = mb
    rnd = L.rng(seed)
    pts = []
    for k in range(n + 1):
        t = k / n
        p = Vector(base) + d * (length * t) + Vector((0, 0, lift * t - droop * t * t))
        pts.append(p)
    base_i = len(verts)
    for k, p in enumerate(pts):
        t = k / n
        w = width * math.sin(math.pi * min(1.0, 0.1 + t)) ** 0.8 * (0.25 if k == n else 1.0)
        serr = 1.0 if k % 2 == 0 else 0.55
        tan = (pts[min(n, k + 1)] - pts[max(0, k - 1)]).normalized()
        up = side.cross(tan).normalized()
        if up.z < 0:
            up = -up
        for s in (-1, 1):
            q = p + side * (s * w * serr) + up * (fold * w * 0.6)
            verts.append(tuple(q))
        verts.append(tuple(p - up * 0.01))
    for k in range(n):
        a = base_i + k * 3
        b = a + 3
        faces.append((a, b, b + 2, a + 2))
        faces.append((a + 2, b + 2, b + 1, a + 1))
        fm.append(0)
        fm.append(1)
    return pts


def palm(name, h=4.4, lean=(0.5, -0.15), n_fr=9, seed=0, coconuts=True, sway=None, x0=(0, 0)):
    """Coconut palm: ringed curved trunk + a crown of drooping serrated fronds + coconuts.  sway(i) re-poses."""
    tm = [B.teak(B.TRUNK, along='Z'), B.teak(B.TRUNK_DARK, along='Z')]
    n = 15
    segs = []
    pts = []
    for k in range(n + 1):
        t = k / n
        x = x0[0] + lean[0] * t * t
        y = x0[1] + lean[1] * t * t
        pts.append(Vector((x, y, h * t)))
    trunk_g = L.group([], name + '_trunk')
    for k in range(n):
        p, q = pts[k], pts[k + 1]
        r0 = 0.17 - 0.06 * k / n
        o = B.rod('%s_tr%d' % (name, k), p, q + (q - p) * 0.05, r0, tm[k % 2], segs=14, r2=r0 * 0.86)
        o.parent = trunk_g
        segs.append(o)
    top = pts[-1]
    crown = L.group([], name + '_crown', loc=tuple(top))
    crown.parent = None
    sphere(name + '_cb', 0.2, (0, 0, 0.0), flat('#8A6A44', 0.9), scale=(1, 1, 0.8), segs=14, rings=8).parent = crown
    lm = [flat(B.PALM_LEAF, 0.6), flat(B.PALM_DARK, 0.65)]
    fronds = []
    rnd = L.rng(seed)
    for k in range(n_fr):
        a = math.tau * k / n_fr + rnd.uniform(-0.2, 0.2)
        ln = rnd.uniform(1.5, 1.9)
        dr = rnd.uniform(0.8, 1.15)
        fg = L.group([], '%s_fg%d' % (name, k))
        fg.parent = crown
        chunk = ([], [], [])
        frond(chunk, (0, 0, 0.05), (math.cos(a), math.sin(a)), length=ln, width=0.3, droop=dr, lift=0.5,
              seed=seed + k)
        o = B.mesh_from('%s_fr%d' % (name, k), chunk[0], chunk[1], lm, chunk[2])
        o.parent = fg
        fronds.append((fg, a))
    if coconuts:
        for k in range(4):
            a = math.tau * k / 4 + 0.3
            sphere('%s_co%d' % (name, k), 0.1, (0.13 * math.cos(a), 0.13 * math.sin(a), -0.12),
                   flat(['#7A5A34', '#8FA04A'][k % 2], 0.6), segs=12, rings=8).parent = crown

    def pose(i, n_):
        ph = 0.0 if i is None else math.tau * i / n_
        amp = 0.0 if i is None else 1.0
        bend = 0.06 * amp * math.sin(ph)
        crown.location = tuple(top + Vector((bend, -bend * 0.4, 0)))
        crown.rotation_euler = Euler((math.radians(2 * amp * math.sin(ph)), math.radians(3 * amp * math.sin(ph)), 0),
                                     'XYZ')
        for k, (fg, a) in enumerate(fronds):
            w = amp * math.sin(ph + k * 0.8)
            fg.rotation_euler = Euler((math.radians(-6 * w * math.sin(a)), math.radians(6 * w * math.cos(a)),
                                       math.radians(3 * w)), 'XYZ')
    pose(None, 4)
    return {'pose': pose, 'top': top}


SWAY_N = 4


def _palm_builder(key, variant):
    def b():
        if variant == 'a':
            P = palm('pa', h=4.4, lean=(0.6, -0.2), n_fr=9, seed=3)
            poses = [P['pose']]
            B.sand_mound('m', 0.35, 0.08, (0, 0, 0), seed=3)
            mbs = L2.MB()
            for k in range(2):
                mbs.sphere(0.1, flat('#7A5A34', 0.6), loc=(0.35 + 0.2 * k, -0.2 - 0.1 * k, 0.08), segs=12, rings=8)
            mbs.done('fallen')
            top = P['top']
        else:
            P1 = palm('pb1', h=3.7, lean=(0.85, 0.35), n_fr=8, seed=7, x0=(0.05, 0.1))
            P2 = palm('pb2', h=2.8, lean=(-0.2, -0.95), n_fr=7, seed=9, coconuts=False, x0=(-0.05, -0.1))
            poses = [P1['pose'], P2['pose']]
            B.sand_mound('m', 0.4, 0.08, (0, 0, 0), seed=5)
            top = P1['top']

        def setter(i):
            for p in poses:
                p(i, SWAY_N)

        def idle():
            for p in poses:
                p(None, SWAY_N)
        frames = loop_frames(key, 'sway', SWAY_N, setter, idle)
        idle()
        return {'frames': frames, 'anims': anim_entry(key, 'sway', SWAY_N, 4), 'fx': {'crown': tuple(top)}}
    return b


beach('palm_tree_a', 'decor', 'beach_nature', fp=('r', 0.3), samples=40, catcher=18.0,
      notes='Coconut palm (~4.6 m): ringed, gently curved trunk, a crown of nine drooping serrated fronds and green / '
            'brown coconuts, two fallen coconuts at the foot. idle = still; anims.sway (= work) = 4-frame breeze loop '
            '(crown bends, fronds flutter). Footprint = the trunk only.', ko='야자수 A', en='Palm tree A',
      zone='nature', anim_name='sway')(_palm_builder('palm_tree_a', 'a'))
beach('palm_tree_b', 'decor', 'beach_nature', fp=('r', 0.35), samples=40, catcher=18.0,
      notes='Twin palm (3.7 m + 2.8 m trunks leaning apart from one sandy foot). idle = still; anims.sway (= work) = '
            '4-frame breeze loop.', ko='야자수 B', en='Palm tree B', zone='nature',
      anim_name='sway')(_palm_builder('palm_tree_b', 'b'))


@beach('beach_pine', 'decor', 'beach_nature', fp=('r', 0.3), samples=40, catcher=18.0,
       notes='Seaside black pine (해송, ~3.6 m): dark twisting trunk with plated bark leaning away from the sea, '
             'layered cloud-like needle pads (deep pine green with lighter tops), a few cones. No snow.',
       ko='해송', en='Seaside pine', zone='nature')
def b_beach_pine():
    bark = B.teak('#5E4632', along='Z')
    path = [Vector((0, 0, 0)), Vector((0.08, 0.05, 0.9)), Vector((0.28, 0.0, 1.7)), Vector((0.2, -0.1, 2.5)),
            Vector((0.42, -0.05, 3.1))]
    pts = L2.catmull(path, n=6)
    mb = L2.MB()
    for k, (p, q) in enumerate(zip(pts, pts[1:])):
        r = 0.16 - 0.1 * k / len(pts)
        mb.seg(p, q + (q - p) * 0.1, r, bark, segs=12, r2=r * 0.95)
    br = [(pts[9], Vector((-0.75, 0.2, 2.0))), (pts[13], Vector((0.95, 0.35, 2.4))), (pts[17], Vector((-0.45, -0.3, 2.9))),
          (pts[6], Vector((0.85, -0.25, 1.35)))]
    for p, q in br:
        mb.seg(p, q, 0.05, bark, segs=8, r2=0.03)
    mb.done('trunk')
    leaf = L.snowy(B.LEAF_DARK, snow='#4F9460', lo=0.3, hi=0.75, noise_amt=0.6, noise_scale=6.0, rough=0.75)
    leaf2 = L.snowy('#3A7A4C', snow='#6AAE6A', lo=0.35, hi=0.8, noise_amt=0.6, noise_scale=7.0, rough=0.75)
    pads = [(Vector((-0.75, 0.2, 2.05)), 0.55), (Vector((0.95, 0.35, 2.45)), 0.6), (Vector((-0.45, -0.3, 2.95)), 0.5),
            (Vector((0.85, -0.25, 1.4)), 0.5), (Vector((0.42, -0.05, 3.2)), 0.65), (Vector((0.1, 0.1, 2.6)), 0.45)]
    for k, (c, r) in enumerate(pads):
        blob('pad%d' % k, r, tuple(c), leaf, scale=(1.0, 0.9, 0.38), seed=k + 2, amp=0.22, freq=2.2, subdiv=3)
        blob('padt%d' % k, r * 0.82, tuple(c + Vector((-0.05, 0.03, 0.09))), leaf2, scale=(1.0, 0.9, 0.3), seed=k + 9,
             amp=0.25, freq=2.6, subdiv=3)
    for k, c in enumerate([Vector((-0.5, 0.0, 1.9)), Vector((0.75, 0.1, 2.25))]):
        sphere('cone%d' % k, 0.05, tuple(c), flat('#8A5A33', 0.8), scale=(1, 1, 1.3), segs=10, rings=6)
    B.sand_mound('m', 0.35, 0.07, (0, 0, 0), seed=6)
    return {}


def grass_tuft(mb, c, n, h, seed, spread=0.18, col=('#8DB85A', '#D9C27A')):
    rnd = L.rng(seed)
    g1 = flat(col[0], 0.7)
    g2 = flat(col[1], 0.75)
    for k in range(n):
        a = rnd.uniform(0, math.tau)
        rr = rnd.uniform(0, spread)
        b0 = Vector((c[0] + rr * math.cos(a), c[1] + rr * math.sin(a), 0.0))
        hh = h * rnd.uniform(0.6, 1.1)
        lean = Vector((math.cos(a), math.sin(a), 0)) * hh * rnd.uniform(0.15, 0.45) + Vector((0.12 * hh, 0, 0))
        p1 = b0 + Vector((0, 0, hh * 0.55)) + lean * 0.3
        p2 = b0 + Vector((0, 0, hh)) + lean
        mb.seg(b0, p1, 0.012, g1, segs=4, r2=0.008)
        mb.seg(p1, p2, 0.008, g2, segs=4, r2=0.002)


def _grass_builder(variant):
    def b():
        mb = L2.MB()
        if variant == 'a':
            grass_tuft(mb, (0, 0), 26, 0.45, 3)
        elif variant == 'b':
            for k, (x, y) in enumerate(((-0.25, 0.1), (0.2, -0.05), (0.0, 0.25), (0.35, 0.3))):
                grass_tuft(mb, (x, y), 22, 0.55 - 0.05 * k, 5 + k)
        else:
            for k, (x, y) in enumerate(((-0.2, 0.0), (0.25, 0.15))):
                grass_tuft(mb, (x, y), 22, 0.5, 11 + k, col=('#79A85A', '#C9B66A'))
        mb.done('grass')
        B.sand_mound('m', 0.35 if variant != 'a' else 0.22, 0.07, (0, 0, 0), seed=7, col=B.SAND)
        if variant == 'c':
            for k, (x, y, z) in enumerate(((-0.1, -0.15, 0.32), (0.32, 0.0, 0.38), (0.1, 0.25, 0.3))):
                for j in range(5):
                    a = math.tau * j / 5
                    sphere('pt%d%d' % (k, j), 0.04, (x + 0.04 * math.cos(a), y + 0.04 * math.sin(a), z),
                           flat('#E8609A', 0.55), scale=(1, 1, 0.45), segs=8, rings=5)
                sphere('pc%d' % k, 0.018, (x, y, z + 0.015), flat(B.YELLOW, 0.5), segs=8, rings=5)
                sphere('lf%d' % k, 0.05, (x - 0.05, y + 0.04, z - 0.1), flat(B.LEAF, 0.6), scale=(1, 0.6, 0.3),
                       segs=8, rings=5)
        return {}
    return b


for _v, _n, _ko in (('a', 'small tuft of marram grass', '갯그령 (작은)'),
                    ('b', 'a wide clump of dune grass', '갯그령 (큰)'),
                    ('c', 'dune grass with pink beach roses (해당화)', '해당화 덤불')):
    beach('dune_grass_' + _v, 'decor', 'beach_nature', fp=None, samples=40,
          notes='Dune grass: %s on a little sand hump; green blades fading to straw tips. Decor (walk-through).' % _n,
          ko=_ko, en='Dune grass ' + _v.upper(), zone='nature')(_grass_builder(_v))


@beach('starfish', 'decor', 'beach_nature', fp=None, samples=40,
       notes='A big orange starfish (with cream dots) and a pink cone shell lying on the sand; pick-up / decor.',
       ko='불가사리', en='Starfish', zone='nature')
def b_starfish():
    B.starfish('star', (0, 0, 0.0), r=0.17, col='#F49A5A', rz=12, t=0.05)
    mb = L2.MB()
    B.shell(mb, (0.24, -0.14, 0.0), s=0.06, col='#F7C6CF', rz=-30, kind='cone')
    mb.done('sh')
    return {}


@beach('driftwood', 'decor', 'beach_nature', fp=(1.6, 0.5), samples=40,
       notes='Bleached driftwood log (1.6 m) with a stubby branch, worn grain, a wisp of seaweed and a shell; a kid can '
             'sit on it (seatPoints, faces SW).', ko='유목', en='Driftwood', zone='nature')
def b_driftwood():
    dw = B.teak(B.DRIFT, along='X', rough=0.8)
    end = L.end_grain(light='#E3D9C6', ring='#BFB3A0')
    o = cyl('log', 0.15, 1.6, (0, 0, 0.13), rot=(0, 90, 8), mat=dw, segs=16, origin='center', bevel=0.05,
            cap_mat=end)
    o.scale = (1.0, 1.0, 1.0)
    B.rod('br', (0.35, 0.05, 0.22), (0.62, -0.25, 0.55), 0.06, dw, segs=10, r2=0.03)
    B.rod('br2', (-0.5, 0.0, 0.2), (-0.7, 0.3, 0.35), 0.045, dw, segs=10, r2=0.02)
    mb = L2.MB()
    sw = flat('#3E7F4A', 0.6)
    for k in range(6):
        x = -0.3 + k * 0.08
        mb.seg((x, -0.15, 0.03), (x + 0.05, -0.32, 0.01), 0.012, sw, segs=4, r2=0.006)
    B.shell(mb, (0.5, -0.3, 0.0), s=0.05, col='#FFFFFF', rz=20)
    mb.done('weed')
    B.sand_mound('m', 0.5, 0.05, (0, 0, 0), seed=8, scale=(1.6, 0.6, 1))
    mark('seat', (-0.2, -0.12, 0.28), facing=(0, -1, 0))
    return {}
