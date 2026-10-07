"""
harbor_props.py - harbour street props (docs/CONTRACT_V6.md section T): bollard, harbor_lamp, anchor_decor, net_rack,
container_stack (+ colour variants), crate_stack, barrel_stack.  Same conventions as harbor_assets.py (anchor =
footprint centre on the quay, z 0 = quay level, baked soft shadow).  Registered into harbor_assets.HARBOR.
"""
import math

import bpy  # noqa: F401
from mathutils import Vector

import prop_lib as L
from prop_lib import flat, snowy, tonal, box, cyl, sphere, blob
import prop_assets as PA
import life_assets as LA
import bld_assets as BA
import town_lib as T
import harbor_lib as H
from harbor_assets import harbor
from bld_assets import mark

CONTAINER_COLS = {'red': '#D9483B', 'blue': '#3D7CC9', 'green': '#3E9A5A', 'yellow': '#F2B632', 'teal': '#3FA58C',
                  'orange': '#E8822A'}


@harbor('bollard', 'decor', 'harbor_props', fp=('r', 0.22), catcher=8.0, samples=48,
        notes='Cast-iron mooring bollard (navy with a red band, snow cap) with a rope loop and a little coil on the '
              '-Y side. Put a few along quay edges / pier sides; fxPoints.ropeTo = the loop (draw a moored ship\'s '
              'bow / stern line from there).', ko='계선주', en='Bollard', zone='street')
def b_bollard():
    H.bollard_model('bol', (0, 0, 0), s=1.0, rope=True, seed=3)
    return {'fx': {'ropeTo': (0.0, 0.0, 0.2)}}


@harbor('harbor_lamp', 'decor', 'harbor_props', fp=('r', 0.25), catcher=10.0,
        notes='Harbour lamp post (~2.9 m): navy cast-iron post with a ship-lantern head (red cap, warm glass), a '
              'life ring hanging on it and a little seagull on top. fxPoints.light = lantern centre (night glow).',
        ko='항구 가로등', en='Harbour lamp', zone='street')
def b_harbor_lamp():
    iron = flat(H.NAVY_DARK, 0.4, 0.5)
    cyl('base', 0.18, 0.3, (0, 0, 0), mat=iron, segs=16, r_top=0.11, bevel=0.03)
    cyl('post', 0.055, 2.3, (0, 0, 0.28), mat=iron, segs=14, r_top=0.045)
    H.torus('collar', 0.07, 0.02, (0, 0, 1.2), mats=[iron], M=16, K=6)
    cyl('arm', 0.03, 0.42, (0, 0, 2.45), rot=(0, 90, -45), mat=iron, segs=8)
    hx, hy, hz = 0.3, -0.3, 2.42
    cyl('hook', 0.02, 0.12, (hx, hy, hz - 0.04), mat=iron, segs=6)
    glass = L.emissive('lglass', '#FFD98A', '#FFB84A', 2.0)
    cyl('lbot', 0.11, 0.06, (hx, hy, hz - 0.5), mat=iron, segs=14, r_top=0.14)
    cyl('lglass', 0.14, 0.3, (hx, hy, hz - 0.45), mat=glass, segs=16, bevel=0.02)
    for a in range(4):
        aa = math.tau * a / 4 + math.pi / 4
        box('lbar', (0.02, 0.02, 0.3), (hx + 0.145 * math.cos(aa), hy + 0.145 * math.sin(aa), hz - 0.45), mat=iron,
            bevel=0.0)
    cyl('lcap', 0.18, 0.14, (hx, hy, hz - 0.15), mat=flat(H.HRED, 0.45), segs=16, r_top=0.05, bevel=0.02)
    PA.snow_cap('lsn', 0.12, (hx, hy, hz - 0.02), 0.04, 3)
    L.point_light('ll', (hx + 0.15, hy - 0.15, hz - 0.3), 'window', 8.0, 0.08)
    sphere('ptop', 0.07, (0, 0, 2.6), iron, segs=12, rings=8)
    H.gull('pgull', (0, 0, 2.64), rz=-50.0, s=0.85)
    H.life_ring('ring', (0.0, -0.1, 1.0), rz=0.0, R=0.19, r=0.05)
    LA.snow_drift('d', 0.18, (0.2, 0.15, 0.0), seed=4)
    return {'fx': {'light': (hx, hy, hz - 0.3)}}


@harbor('anchor_decor', 'decor', 'harbor_props', fp=(1.4, 1.2), catcher=12.0,
        notes='Monument anchor (~1.5 m): a big navy anchor standing in a snowy rock mound with a heavy chain draped '
              'around it and a little brass plaque - plaza / waterfront decoration.',
        ko='닻 장식', en='Anchor monument', zone='street')
def b_anchor_decor():
    rock = snowy('#7D8592', lo=0.5, hi=0.78, noise_amt=0.45)
    blob('mound', 0.55, (0, 0, 0.0), rock, scale=(1.25, 1.0, 0.55), seed=5, amp=0.25, subdiv=3, flat_bottom=0.1)
    rnd = L.rng(3)
    for k in range(5):
        a = math.tau * k / 5 + 0.3
        blob('rk%d' % k, rnd.uniform(0.14, 0.2), (0.62 * math.cos(a), 0.5 * math.sin(a), 0.04), rock,
             scale=(1.3, 1.0, 0.75), seed=k + 8, amp=0.3, subdiv=2, flat_bottom=0.4)
    H.anchor_model('anchor', s=1.85, col=H.NAVY, loc=(0, 0, 0.92), rot=(0, 0, 45), stock_col='#8A5A33')
    mb = L.MB()
    cm = flat('#5A606B', 0.35, 0.6)
    pts = []
    for k in range(26):
        t = k / 25
        a = -0.6 + t * 4.2
        pts.append(Vector((0.55 * math.cos(a) * (1 - 0.3 * t), 0.45 * math.sin(a) * (1 - 0.3 * t), 0.3 + 0.9 * t * t)))
    for k, (p, q) in enumerate(zip(pts, pts[1:])):
        c = (p + q) / 2
        d = (q - p)
        rot = Vector((1, 0, 0)).rotation_difference(d.normalized()).to_euler()
        mb.ico(0.05, cm, loc=tuple(c), scale=(1.6, 0.6, 1.0) if k % 2 else (1.6, 1.0, 0.6),
               rot=tuple(math.degrees(r) for r in rot), subdiv=1)
    mb.done('chain')
    box('plaque', (0.3, 0.04, 0.2), (0.05, -0.5, 0.22), rot=(-20, 0, 0), mat=flat('#E2B33C', 0.3, 0.8), bevel=0.02)
    PA.snow_cap('asn', 0.22, (0.0, 0.0, 1.62), 0.05, 4, scale=(1.4, 0.6, 1))
    return {}


@harbor('net_rack', 'decor', 'harbor_props', fp=(2.2, 0.9), catcher=14.0,
        notes='Net drying rack (2.2 m): wooden A-frames with a pole, fishing nets draped over it with orange and '
              'white floats, a few hanging dried fish and a gull. workPoints = two spots where fishermen mend the '
              'nets.', ko='그물 건조대', en='Net rack', zone='street')
def b_net_rack():
    wood = tonal('#8A5A33', 0.1, 4.0)
    for x in (-1.0, 1.0):
        for s in (-1, 1):
            H.beam('aframe', (x, s * 0.4, 0.0), (x, 0.0, 1.65), 0.07, wood)
        box('acrossb', (0.06, 0.7, 0.06), (x, 0.0, 0.55), mat=wood, bevel=0.01)
    cyl('pole', 0.05, 2.3, (-1.15, 0.0, 1.62), rot=(0, 90, 0), mat=wood, segs=10)
    # draped net: a cloth sheet hanging on both sides of the pole
    import bmesh
    bm = bmesh.new()
    nx, nz = 16, 8
    rows = []
    for j in range(nz + 1):
        row = []
        for i in range(nx + 1):
            u = i / nx
            v = j / nz
            x = -0.98 + 1.96 * u
            sag = 0.12 * math.sin(math.pi * u)
            y = -0.06 - 0.32 * v - 0.04 * math.sin(u * 9.0 + v * 3)
            z = 1.62 - 1.05 * v - sag - 0.05 * math.sin(u * 7.0)
            row.append(bm.verts.new((x, y, z)))
        rows.append(row)
    for j in range(nz):
        for i in range(nx):
            bm.faces.new((rows[j][i], rows[j][i + 1], rows[j + 1][i + 1], rows[j + 1][i]))
    bmesh.ops.solidify(bm, geom=bm.faces[:], thickness=0.02)
    L.finish('net', bm, [BA.net_mat('#EFE9DA', '#3E6E8E', 18.0)])
    bm = bmesh.new()
    rows = []
    for j in range(nz + 1):
        row = []
        for i in range(nx + 1):
            u = i / nx
            v = j / nz
            x = -0.98 + 1.96 * u
            y = 0.06 + 0.25 * v
            z = 1.62 - 0.8 * v - 0.1 * math.sin(math.pi * u) - 0.04 * math.sin(u * 6.0)
            row.append(bm.verts.new((x, y, z)))
        rows.append(row)
    for j in range(nz):
        for i in range(nx):
            bm.faces.new((rows[j][i], rows[j][i + 1], rows[j + 1][i + 1], rows[j + 1][i]))
    bmesh.ops.solidify(bm, geom=bm.faces[:], thickness=0.02)
    L.finish('net2', bm, [BA.net_mat('#EFE9DA', '#4E7E9E', 18.0)])
    for k in range(7):
        u = (k + 0.5) / 7
        x = -0.98 + 1.96 * u
        z = 1.62 - 1.05 - 0.12 * math.sin(math.pi * u) - 0.05 * math.sin(u * 7.0)
        sphere('float%d' % k, 0.07, (x, -0.4 - 0.04 * math.sin(u * 9.0 + 3), z + 0.02),
               flat(['#F08A2A', '#F4F1EA'][k % 2], 0.4), segs=12, rings=8)
    for k in range(3):
        PA.fish_model('dfish%d' % k, length=0.3, height=0.14, thick=0.06, loc=(-0.6 + 0.6 * k, -0.08, 1.38),
                      rot=(90, 90, 0))
    L.snow_slab('psnow', 2.0, 0.12, 0.04, (0.0, 0.0, 1.66), seed=4)
    H.gull('ngull', (0.95, 0.0, 1.68), rz=-110.0, s=0.85)
    box('stool', (0.32, 0.32, 0.36), (-0.6, -0.85, 0.0), mat=wood, bevel=0.03)
    H.rope_coil('ncoil', (0.65, -0.75, 0.0), r=0.17)
    mark('work', (-0.6, -0.9, 0.0), facing=(0, 1, 0))
    mark('work', (0.35, -0.95, 0.0), facing=(-0.2, 1, 0))
    return {}


def _container_stack(layout, seed=0):
    """layout = [(x, y, level, colour key, rz)]; containers are 2.4 x 1.1 x 1.1 m (toy scale)."""
    for k, (x, y, lvl, ck, rz) in enumerate(layout):
        H.container_model('ct%d' % k, (x, y, lvl * 1.1), rz=rz, col=CONTAINER_COLS[ck], seed=seed + k,
                          snow=all(not (abs(x - x2) < 0.6 and abs(y - y2) < 0.6 and l2 == lvl + 1)
                                   for x2, y2, l2, _, _ in layout))


CONT_NOTE = ('Stack of toy shipping containers (2.4 x 1.1 x 1.1 m each, corrugated, door ends with lock bars, snow on '
             'top): %s. Container yard decor; porters can use inPoint (front) as the drop pad.')


@harbor('container_stack', 'decor', 'harbor_props', fp=(2.6, 2.4), catcher=16.0,
        notes=CONT_NOTE % 'two side by side (red, blue) + a green one on top', ko='컨테이너 더미', en='Containers',
        zone='yard')
def b_container_stack():
    _container_stack([(0.0, 0.58, 0, 'blue', 0.0), (0.0, -0.58, 0, 'red', 0.0), (0.15, 0.0, 1, 'green', 0.0)])
    mark('in', (0.0, -1.55, 0.0))
    return {}


@harbor('container_stack_b', 'decor', 'harbor_props', fp=(2.6, 2.4), catcher=16.0,
        notes=CONT_NOTE % 'two by two (yellow, teal, orange, blue), the top pair slightly shifted',
        ko='컨테이너 더미 B', en='Containers B', zone='yard')
def b_container_stack_b():
    _container_stack([(0.0, 0.58, 0, 'teal', 0.0), (0.0, -0.58, 0, 'yellow', 0.0), (0.12, 0.58, 1, 'orange', 0.0),
                      (-0.1, -0.58, 1, 'blue', 0.0)], seed=10)
    mark('in', (0.0, -1.55, 0.0))
    return {}


for _ck in ('red', 'blue', 'green', 'yellow'):
    def _mk(ck):
        def fn():
            H.container_model('ct', (0, 0, 0), rz=0.0, col=CONTAINER_COLS[ck], seed=3)
            return {}
        return fn
    harbor('container_%s' % _ck, 'decor', 'harbor_props', fp=(2.4, 1.1), catcher=12.0,
           notes='Single %s toy shipping container (2.4 x 1.1 x 1.1 m, long axis along world X, doors at +X). '
                 'Ground-level piece (stacking separate sprites would double the baked shadow: use the stacks).' % _ck,
           ko='컨테이너', en='Container (%s)' % _ck, zone='yard')(_mk(_ck))


@harbor('crate_stack', 'decor', 'harbor_props', fp=(1.8, 1.4), catcher=12.0,
        notes='Pyramid of wooden cargo crates (3 + 2 + 1) lashed with rope, a few sacks and a tarp - quay cargo pile. '
              'inPoint = drop pad in front.', ko='나무상자 더미', en='Crate stack', zone='yard')
def b_crate_stack():
    s = 0.6
    pos = [(-0.62, 0.0, 0), (0.0, 0.05, 0), (0.62, -0.02, 0), (-0.31, 0.02, 1), (0.31, 0.0, 1), (0.0, 0.0, 2)]
    for k, (x, y, lvl) in enumerate(pos):
        PA.crate_model('cr%d' % k, s, (x, y, lvl * s), rot=(0, 0, [3, -4, 6, -2, 4, 8][k]), seed=k,
                       snow=lvl == 2 or (lvl == 1 and False) or (lvl == 0 and x > 0.5))
    mb = L.MB()
    rope = flat(H.ROPE, 0.85)
    mb.seg((-0.95, -0.32, 0.05), (0.0, -0.33, 1.82), 0.018, rope, segs=6)
    mb.seg((0.95, -0.34, 0.05), (0.0, -0.33, 1.82), 0.018, rope, segs=6)
    mb.done('lash')
    BA.sack('sk1', (0.9, -0.55, 0.0), s=1.0, seed=2)
    BA.sack('sk2', (0.55, -0.62, 0.0), s=0.9, seed=4, tie='#3D7CC9')
    box('tarp', (0.66, 0.66, 0.05), (0.0, 0.0, 1.8), mat=flat(H.HBLUE, 0.7), bevel=0.02)
    LA.snow_drift('d', 0.2, (-0.9, 0.45, 0.0), seed=7)
    mark('in', (-0.3, -0.95, 0.0))
    return {}


@harbor('barrel_stack', 'decor', 'harbor_props', fp=(1.8, 1.2), catcher=12.0,
        notes='Barrels lying in a chocked pyramid (3 + 2) with two standing barrels beside it - cargo / fish-oil '
              'barrels on the quay. inPoint = drop pad in front.', ko='통 더미', en='Barrel stack', zone='yard')
def b_barrel_stack():
    r, h = 0.27, 0.72
    for k, (y, z) in enumerate(((-0.55, r), (0.0, r), (0.55, r), (-0.28, r * 2.7), (0.28, r * 2.7))):
        with L.Collect() as bc_:
            PA.barrel_model('lb%d' % k, r, h, (0, 0, -h / 2), seed=k, snow=False)
        L.group(BA.top_level(bc_.objs), 'lbg%d' % k, loc=(-0.15, y, z), rot=(0, 90, 0))
    for s in (-1, 1):
        box('chock', (0.85, 0.12, 0.12), (-0.15, s * 0.82, 0.0), mat=tonal('#8A5A33', 0.1, 4.0), bevel=0.02)
    PA.barrel_model('ub1', 0.26, 0.72, (0.65, -0.65, 0.0), seed=7)
    PA.barrel_model('ub2', 0.24, 0.66, (0.7, 0.0, 0.0), seed=8)
    PA.snow_cap('bsn', 0.25, (-0.15, 0.0, r * 3.6), 0.06, 5, scale=(1.6, 1.2, 1.0))
    mark('in', (0.1, -1.05, 0.0))
    return {}
