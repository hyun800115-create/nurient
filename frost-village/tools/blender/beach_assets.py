"""
beach_assets.py - registry + builders of the v7 "햇살 해변" (Sunny Beach) ground props (docs/CONTRACT_V7.md
section W).  Rendered by beach_render.render_beach(), packed by beach_pack.py into assets/beach/.

Registry BEACH maps a build key to its builder + metadata (format of harbor_assets.HARBOR):
    beach(key, kind, atlas, fp, yaw, shadow, samples, notes, front, catcher, work, fps, sprites, extra, ko, en, zone,
          anim_name, ground)
A builder returns (all optional):
    frames  [(frame name, setter)]  states sharing ONE frame + anchor (idle first)
    anims   {anim: {frames, fps, repeat}}            named loops (flutter / sway / water / bob / bounce / fly ...)
    sprites {sprite key: {frame, stage, ...}}        several sprite keys from one build (sandcastle build stages)
    fx      {name: world point}  -> fxPoints         points {name: world point | [points]} -> named px points
    extra   {...} merged into the manifest entry     overlay {'key', 'at'} occluder overlay (camera-side plane)
    tile    {'axis', 'seg', 'ramp', 'ends', 'cuts'}  seamless tile (boardwalk, buoy line)

Conventions (beach_lib.py): 1 unit = 1 m, origin = footprint centre = anchor, local front = -Y (the sea side), z 0 =
sand.  Interaction markers use bld_assets.mark(kind, loc, facing):
    staff -> staffPoints/Dirs   customer -> customerPoints/Dirs   seat -> seatPoints/Dirs   lie -> lyingPoints/Dirs
    work -> workPoints/Dirs     look -> lookDir (+ lookPoint)     play -> playPoints/Dirs   wait -> waitPoints/Dirs
"""
import math
from collections import OrderedDict

import bpy  # noqa: F401
from mathutils import Vector, Euler

import prop_lib as L
from prop_lib import C, flat, tonal, box, cyl, sphere, blob, extrude, hexmix
import life2_lib as L2
import bld_assets as BA
from bld_assets import mark
import beach_lib as B

BEACH = OrderedDict()


def beach(key, kind, atlas, fp=None, yaw=0.0, shadow=True, samples=40, notes='', front='-Y', catcher=14.0, work=0,
          fps=8, sprites=None, extra=None, ko=None, en=None, zone=None, anim_name=None, ground='sand', item=None):
    def deco(fn):
        ex = dict(extra or {})
        if ko or en:
            ex['name'] = {'ko': ko or key, 'en': en or key}
        if zone:
            ex['zone'] = zone
        if ground == 'water':
            ex.setdefault('waterPlane', True)
            ex.setdefault('waterline', 'anchor')
        BEACH[key] = dict(key=key, fn=fn, kind=kind, atlas=atlas, fp=fp, yaw=yaw, shadow=shadow and not item,
                          samples=samples, notes=notes, front=front, catcher=catcher, work=work, fps=fps, item=item,
                          sprites=sprites, extra=ex, anim_name=anim_name, ground=ground)
        return fn
    return deco


def loop_frames(key, anim, n, setter, idle):
    """[(key, idle), (key_<anim>_0, ...), ...] + {anim: {...}}"""
    fr = [(key, idle)] + [('%s_%s_%d' % (key, anim, i), (lambda i=i: setter(i))) for i in range(n)]
    return fr


def anim_entry(key, anim, n, fps, alias_work=True):
    names = ['%s_%s_%d' % (key, anim, i) for i in range(n)]
    a = {anim: {'frames': names, 'fps': fps, 'repeat': -1}}
    if alias_work and anim != 'work':
        a['work'] = {'frames': list(names), 'fps': fps, 'repeat': -1}
    return a


# =========================================================================== PARASOLS

PARASOL_NOTE = ('Beach parasol "%s" (canopy 2.1 m across, ~2.35 m tall): 8 woven canvas panels that sag between the '
                'ribs, darker seam piping on every rib, scalloped valance flaps with a cream tassel fringe, white rib '
                'tips, two-tone pole with a chrome tilt joint and wooden finial, foot pushed into a little sand mound. '
                'idle = still; anims.flutter (= work) = 4-frame breeze loop (flaps lift and ripple, panels breathe). '
                'points.shade = centre of its baked canopy shadow on the sand (put a lounger / towel there); '
                'footprint = the pole only (walk under the canopy).')


def _parasol_builder(key, way):
    cols = list(B.PARASOL_WAYS[way])

    def b():
        P = B.parasol('ps', cols, seed=len(key))
        idle = (lambda: P['set_wind'](None))
        frames = loop_frames(key, 'flutter', 4, lambda i: P['set_wind'](i, 4), idle)
        idle()
        k = L.SHADOW_K
        return {'frames': frames, 'anims': anim_entry(key, 'flutter', 4, 6),
                'fx': {'top': (0, 0, 2.38)},
                'points': {'shade': (k * 2.05, 0.0, 0.0)},
                'extra': {'shadeRadiusM': 1.05, 'canopyTopPx': -int(round(2.4 * 55.4256)), 'colourway': way}}
    return b


for _way, _ko in (('red', '빨강'), ('blue', '파랑'), ('yellow', '노랑'), ('green', '초록'), ('pink', '분홍'),
                  ('rainbow', '무지개')):
    _k = 'parasol_' + _way
    beach(_k, 'decor', 'beach_shade', fp=('r', 0.2), samples=40, notes=PARASOL_NOTE % _way, ko='파라솔 (%s)' % _ko,
          en='Parasol (%s)' % _way, zone='shade', anim_name='flutter', catcher=16.0)(_parasol_builder(_k, _way))


# =========================================================================== SUN LOUNGER

LOUNGER_NOTE = ('Wooden sun lounger (%s): oiled dark-teak frame with leg pairs and two rubber wheels at the head, '
                'lighter teak slats, raised backrest on a prop bar, a turquoise-and-white striped cushion with white '
                'piping and tufting buttons, a rolled pink towel at the head. lyingPoints[0] = hip point on the cushion '
                '(anchor of a beachfolk `sunbathe` frame), lyingHeadPoints / lyingFeetPoints = where the head / feet '
                'rest. lyingFeetDirs = screen direction hips -> FEET (%s) = the `dir` to play beachfolk `sunbathe` with '
                '(its dir is where the feet point); lyingDirs = hips -> head (%s), kept for reference. seatPoints = '
                'sitting sideways on the %s cushion edge (townsfolk2 `sit` anchor = seat front-centre at 0.45 m, faces '
                '%s); seatGroundPoints = the sand under it.')


def seat(loc, facing, ground=True):
    """`sit` anchor (seat front-centre, townsfolk2 / villagers convention) + the ground point under it."""
    mark('seat', loc, facing=facing)
    if ground:
        BA.MARKERS.append(('seatground', _empty((loc[0], loc[1], 0.0)), None))


def _lounger_builder(axis):
    def b():
        R = B.lounger('lg')
        mark('lie', tuple(R['lie']), facing=(0, 1, 0))
        BA.MARKERS.append(('liehead', _empty(R['head']), None))
        BA.MARKERS.append(('liefeet', _empty(R['feet']), None))
        # sit sideways on the cushion edge on the CAMERA side, facing out: +X (SE) for the Y lounger, local -X ->
        # world -Y (SW) for the X lounger (yaw 90).  Polish: was on the far rail facing NE (no sit-NE frames).
        sx = 1 if axis == 'y' else -1
        seat((sx * 0.31, -0.3, 0.45), facing=(sx, 0, 0))
        return {'extra': {'lyingHeightM': round(R['lie'].z, 3), 'backrestDeg': 38, 'seatHeightM': 0.45}}
    return b


def _empty(p):
    em = bpy.data.objects.new('MKX', None)
    bpy.context.scene.collection.objects.link(em)
    em.location = tuple(p)
    return em


beach('sun_lounger', 'decor', 'beach_shade', fp=(0.7, 1.95), yaw=0.0, samples=40,
      notes=LOUNGER_NOTE % ('along world Y, head at +Y = screen up-right', 'SW', 'NE', '+X (screen down-right)', 'SE'),
      ko='선베드', en='Sun lounger', zone='shade', extra={'lyingAxis': 'y', 'seatDepth': 'front'})(_lounger_builder('y'))
beach('sun_lounger_x', 'decor', 'beach_shade', fp=(0.7, 1.95), yaw=90.0, samples=40,
      notes=LOUNGER_NOTE % ('along world X, head at -X = screen up-left', 'SE', 'NW', '-Y (screen down-left)', 'SW'),
      ko='선베드 (X축)', en='Sun lounger (X axis)', zone='shade',
      extra={'lyingAxis': 'x', 'seatDepth': 'front'})(_lounger_builder('x'))


# =========================================================================== LIFEGUARD TOWER

TOWER_NOTE = ('Lifeguard tower (1.6 x 1.6 m, ~4.3 m tall to the flag): splayed white legs with red bands, cross braces, '
              'a teak platform at 1.76 m with a white railing, a tall wooden high chair, a red-and-white striped canvas '
              'roof with scalloped valance, a teak ladder on the +X side, red/yellow lifeguard flag, an orange rescue '
              'tube on the front rail, a red board with a white cross, a life ring and binoculars. It faces the sea '
              '(-Y). staffPoint = the guard standing at the front rail (feet on the platform, height included), '
              'lookDir = SW (the sea); seatPoints = the high chair. Draw: tower -> guard (staffDepth front) -> '
              'lifeguard_tower_front (overlay: the railing / board in front of the guard, same frame + anchor). '
              'ladderPoint = foot of the ladder (climb from there).')

PLAT_Z = 1.76


@beach('lifeguard_tower', 'building', 'beach_service', fp=(1.6, 1.6), samples=48, notes=TOWER_NOTE,
       ko='인명구조 감시탑', en='Lifeguard tower', zone='service', catcher=18.0)
def b_lifeguard_tower():
    white = B.painted(B.WOOD_WHITE)
    red = B.painted(B.RESCUE_RED)
    tk = B.teak(B.TEAK, along='Y')
    tkx = B.teak(B.TEAK, along='X')
    z0, z1 = 0.0, 1.68
    b0, b1 = 0.78, 0.6                       # half spread at the foot / under the platform
    legs = []
    for sx in (-1, 1):
        for sy in (-1, 1):
            p = Vector((sx * b0, sy * b0, z0))
            q = Vector((sx * b1, sy * b1, z1))
            legs.append((p, q))
            B.rod('leg', p + Vector((0, 0, -0.05)), q, 0.06, white, segs=10)
            # red bands near the foot + sand mounds
            d = (q - p).normalized()
            B.rod('band', p + d * 0.18, p + d * 0.36, 0.064, red, segs=10)
            B.sand_mound('lm', 0.14, 0.05, (p.x, p.y, 0), seed=int(3 + sx + 2 * sy))
    # cross braces (X on the 4 faces, horizontal ring)
    mb = L2.MB()
    for (a, b_) in ((0, 1), (2, 3), (0, 2), (1, 3)):
        pa, qa = legs[a]
        pb, qb = legs[b_]
        f0, f1 = 0.22, 0.78
        mb.seg(pa.lerp(qa, f0), pb.lerp(qb, f1), 0.03, white, segs=8)
        mb.seg(pb.lerp(qb, f0), pa.lerp(qa, f1), 0.03, white, segs=8)
        mb.seg(pa.lerp(qa, 0.5), pb.lerp(qb, 0.5), 0.032, white, segs=8)
    mb.done('braces')
    # platform: frame + teak deck planks (along X)
    box('plat', (1.42, 1.42, 0.1), (0, 0, PLAT_Z - 0.1), mat=white, bevel=0.03)
    n = 8
    for k in range(n):
        y = -0.66 + 1.32 * (k + 0.5) / n
        box('dk%d' % k, (1.36, 1.32 / n - 0.02, 0.04), (0, y, PLAT_Z - 0.02), mat=tkx, bevel=0.008)
    # railing: posts + top / mid rail on the front (-Y), both sides; back has the chair; +X side leaves a gap at
    # the ladder (back half)
    rail_h = 0.78
    mbr = L2.MB()
    posts = [(-0.68, -0.68), (0.0, -0.68), (0.68, -0.68), (-0.68, 0.0), (-0.68, 0.68), (0.68, -0.05), (0.68, 0.68),
             (0.0, 0.68)]
    for (x, y) in posts:
        mbr.seg((x, y, PLAT_Z - 0.02), (x, y, PLAT_Z + rail_h), 0.03, white, segs=8)
        mbr.sphere(0.04, white, loc=(x, y, PLAT_Z + rail_h + 0.01), segs=10, rings=6)
    for zz, rr in ((PLAT_Z + rail_h - 0.02, 0.028), (PLAT_Z + 0.4, 0.02)):
        for (a, b_) in (((-0.68, -0.68), (0.68, -0.68)), ((-0.68, -0.68), (-0.68, 0.68)),
                        ((-0.68, 0.68), (0.68, 0.68)), ((0.68, -0.68), (0.68, -0.05))):
            mbr.seg((a[0], a[1], zz), (b_[0], b_[1], zz), rr, white, segs=8)
    mbr.done('rail')
    # high chair at the back facing -Y
    ch = B.painted(B.TEAK)
    cz = PLAT_Z
    seat_z = cz + 0.5
    for sx in (-1, 1):
        for sy in (-1, 1):
            box('chl', (0.05, 0.05, 0.5), (sx * 0.24, 0.32 + sy * 0.18, cz), mat=ch, bevel=0.012)
    box('chs', (0.56, 0.46, 0.05), (0, 0.32, seat_z - 0.05), mat=ch, bevel=0.015)
    box('chb', (0.56, 0.05, 0.55), (0, 0.55, seat_z), rot=(-10, 0, 0), mat=ch, bevel=0.015)
    for sx in (-1, 1):
        box('cha', (0.05, 0.42, 0.04), (sx * 0.28, 0.34, seat_z + 0.2), mat=ch, bevel=0.012)
        box('chap', (0.04, 0.04, 0.2), (sx * 0.28, 0.17, seat_z), mat=ch, bevel=0.01)
    B.plate('chcush', 0.5, 0.4, 0.04, (0, 0.32, seat_z), B.canvas(B.RESCUE_YELLOW), r=0.06)
    # roof posts + striped canvas roof (pyramid) with scalloped valance
    eave = 3.55
    ridge = 3.98
    for sx in (-1, 1):
        for sy in (-1, 1):
            B.rod('rp', (sx * 0.64, sy * 0.64, PLAT_Z - 0.02), (sx * 0.64, sy * 0.64, eave), 0.03, white, segs=8)
    roof_canvas(0.86, eave, ridge)
    # ladder on +X: from the sand at x 1.2 up to the platform edge at x 0.7 (back half, y 0.1 .. 0.6)
    lx0, lx1 = 1.32, 0.72
    for y in (0.14, 0.58):
        B.rod('lad', (lx0, y, 0.0), (lx1, y, PLAT_Z + 0.02), 0.03, tk, segs=8)
    mbl = L2.MB()
    for k in range(1, 7):
        f = k / 7.0
        x = lx0 + (lx1 - lx0) * f
        z = PLAT_Z * f
        mbl.cube((0.07, 0.46, 0.03), tkx, loc=(x, 0.36, z + 0.01))
    mbl.done('rungs')
    # flag pole at the back-left corner with a red/yellow lifeguard flag
    B.rod('fpole', (-0.66, 0.66, PLAT_Z), (-0.66, 0.66, 4.45), 0.022, B.metal(B.STEEL), segs=8)
    sphere('fball', 0.04, (-0.66, 0.66, 4.47), B.metal('#E9C46A', 0.3, 0.7), segs=10, rings=6)
    B.flag('flag', (-0.66, 0.66, 4.4), 0.62, 0.42, (B.RESCUE_RED, B.RESCUE_YELLOW), rz=-60.0, wave=0.07, split='h')
    # front-rail gear: rescue tube, a red board with a white cross, binoculars on the rail, life ring on +X side
    B.rescue_tube('tube', (0.34, -0.74, PLAT_Z + 0.42), rot=(0, 0, 0), length=0.72)
    B.board_xz('sign', 0.42, 0.34, 0.03, (-0.36, -0.73, PLAT_Z + 0.14), B.painted(B.RESCUE_RED), r=0.05)
    B.board_xz('cr1', 0.24, 0.07, 0.012, (-0.36, -0.765, PLAT_Z + 0.275), flat(B.WHITE, 0.5), r=0.015)
    B.board_xz('cr2', 0.07, 0.24, 0.012, (-0.36, -0.765, PLAT_Z + 0.19), flat(B.WHITE, 0.5), r=0.015)
    binoculars('bino', (-0.05, -0.68, PLAT_Z + rail_h + 0.035), rz=-20)
    B.torus('ring', 0.16, 0.05, (0.71, -0.36, PLAT_Z + 0.42), rot=(90, 0, 90),
            mats=[B.vinyl(B.RESCUE_RED, 0.4, 0.3), B.vinyl(B.WHITE, 0.4, 0.3)], seg_fn=lambda j, k: (j // 4) % 2)
    # markers
    mark('staff', (0.0, -0.36, PLAT_Z), facing=(0, -1, 0))
    mark('seat', (0.0, 0.1, seat_z), facing=(0, -1, 0))
    BA.MARKERS.append(('seatground', _empty((0.0, 0.1, PLAT_Z)), None))      # the platform under the high chair
    mark('look', (0.0, -3.0, 0.0), facing=(0, -1, 0))
    BA.MARKERS.append(('ladder', _empty((lx0 + 0.25, 0.36, 0.0)), None))
    return {'overlay': {'key': 'lifeguard_tower_front', 'at': (0.0, -0.36, 0.0)},
            'fx': {'flag': (-0.4, 0.66, 4.25), 'whistle': (0.0, -0.36, PLAT_Z + 1.25)},
            'extra': {'platformM': PLAT_Z, 'staffDepth': 'front', 'lookDir': 'SW'}}


def roof_canvas(h, eave, ridge, cols=(B.RESCUE_RED, B.WHITE), n_str=6, name='roof'):
    """Pyramid canvas roof over a square (half-size h): 4 faces with alternating stripes running down the slope, a
    scalloped valance flap on every edge and a small finial."""
    M = n_str * 2
    verts, faces, fm = [], [], []
    corners = [(-h, -h), (h, -h), (h, h), (-h, h)]
    apex = Vector((0, 0, ridge))
    mats = [B.canvas(cols[0]), B.canvas(cols[1])]
    for f in range(4):
        a = Vector((*corners[f], eave))
        b_ = Vector((*corners[(f + 1) % 4], eave))
        for k in range(M):
            p0 = a.lerp(b_, k / M)
            p1 = a.lerp(b_, (k + 1) / M)
            base = len(verts)
            # slight sag between corners
            sg0 = 0.05 * math.sin(math.pi * k / M)
            sg1 = 0.05 * math.sin(math.pi * (k + 1) / M)
            verts += [tuple(p0 - Vector((0, 0, sg0))), tuple(p1 - Vector((0, 0, sg1))), tuple(apex)]
            faces.append((base, base + 1, base + 2))
            fm.append(k % 2)
    o = B.mesh_from(name, verts, faces, mats, fm, smooth=False)
    B.solidify(o, 0.02, 1.0)
    mbv = L2.MB()
    for f in range(4):
        a = Vector((*corners[f], eave))
        b_ = Vector((*corners[(f + 1) % 4], eave))
        out = (a + b_) / 2
        out.z = 0
        out = out.normalized()
        for k in range(M):
            p = a.lerp(b_, (k + 0.5) / M) - Vector((0, 0, 0.05 * math.sin(math.pi * (k + 0.5) / M)))
            mbv.sphere(1.0, mats[k % 2], loc=tuple(p + out * 0.01 - Vector((0, 0, 0.05))),
                       scale=(0.11 if abs(out.y) > 0.5 else 0.012, 0.11 if abs(out.x) > 0.5 else 0.012, 0.08),
                       segs=12, rings=6)
    mbv.done(name + '_val')
    sphere(name + '_fin', 0.06, (0, 0, ridge + 0.03), B.painted(B.WHITE), segs=12, rings=8)
    return o


def binoculars(name, loc, rz=0.0):
    with L.Collect() as c:
        for sx in (-1, 1):
            cyl(name + '_t', 0.03, 0.12, (sx * 0.035, 0, 0), rot=(90, 0, 0), mat=flat('#2E3440', 0.4), segs=12,
                origin='center', bevel=0.008)
            cyl(name + '_l', 0.024, 0.01, (sx * 0.035, -0.062, 0), rot=(90, 0, 0), mat=flat('#7FB8E0', 0.1, 0.3),
                segs=12, origin='center', bevel=0.0)
        box(name + '_b', (0.05, 0.04, 0.03), (0, 0, -0.015), mat=flat('#2E3440', 0.4), bevel=0.008)
    return L.group([o for o in c.objs if o.parent is None], name, loc=loc, rot=(0, 0, rz))


# =========================================================================== SANDCASTLES

SC_NOTE = ('Sandcastle %s: damp packed sand (fine grain, one step darker than the dry sand), bucket-moulded towers '
           'with ridges and crenellations, drip spires, scallop / cone shells, a little starfish and a paper pennant '
           'flag. workPoints / workDirs = kneeling diggers (beachfolk `dig`: SE / SW / S) on the FAR side so the '
           'castle stays in front of them (workDepth "behind" = normal y-sort). Decor on the sand (no collision needed '
           'for S).')


def castle_s(seed=0, x=0.0, y=0.0, flag_col=B.RED):
    m = B.sand(B.SAND_DAMP)
    B.tower_bucket('t0', (x, y, 0.0), r=0.13, h=0.24, mat=m, seed=seed)
    B.sand_mound('base', 0.24, 0.05, (x, y, 0), seed=seed + 1, col=B.SAND_DAMP)
    B.rod('fst', (x, y, 0.24), (x, y, 0.48), 0.006, flat('#E9D9B8', 0.6), segs=6)
    B.pennant('fl', (x, y, 0.475), 0.12, 0.08, flag_col, rz=-30)
    mb = L2.MB()
    B.shell(mb, (x - 0.2, y - 0.1, 0.0), s=0.05, col='#F6E3D4', rz=30)
    B.shell(mb, (x + 0.05, y - 0.2, 0.0), s=0.04, col='#F7C6CF', rz=-20, kind='cone')
    B.shell(mb, (x + 0.12, y - 0.115, 0.13), s=0.035, col='#FFFFFF', rz=-40)
    mb.done('shells')


def castle_m(seed=0, x=0.0, y=0.0, flag_col=B.RED, decor=True):
    m = B.sand(B.SAND_DAMP)
    B.sand_mound('base', 0.55, 0.09, (x, y, 0), seed=seed + 1, col=B.SAND_DAMP, scale=(1, 0.85, 1))
    # keep in the middle: big bucket + drip spire
    B.tower_bucket('keep', (x, y + 0.05, 0.04), r=0.17, h=0.3, mat=m, seed=seed, crenel=False)
    B.drip_spire('spire', (x, y + 0.05, 0.33), r=0.09, h=0.3, mat=m, seed=seed)
    # two side towers + wall between them in front
    for sx in (-1, 1):
        B.tower_bucket('tw%d' % sx, (x + sx * 0.32, y - 0.12, 0.02), r=0.11, h=0.22, mat=m, seed=seed + sx)
    box('wall', (0.5, 0.1, 0.13), (x, y - 0.14, 0.02), mat=m, bevel=0.03)
    mb = L2.MB()
    for k in range(5):
        mb.cube((0.055, 0.1, 0.04), m, loc=(x - 0.2 + k * 0.1, y - 0.14, 0.17))
    mb.done('wcren')
    # arched gate (dark hollow)
    sphere('gate', 0.055, (x, y - 0.19, 0.05), flat('#9B7B52', 0.95), scale=(1, 0.4, 1.3), segs=12, rings=8)
    B.rod('fst', (x, y + 0.05, 0.6), (x, y + 0.05, 0.85), 0.006, flat('#E9D9B8', 0.6), segs=6)
    B.pennant('fl', (x, y + 0.05, 0.845), 0.14, 0.09, flag_col, rz=-30)
    if decor:
        mb = L2.MB()
        for k, (dx, dy, z, col, kind) in enumerate(((-0.4, -0.3, 0.0, '#F6E3D4', 'scallop'),
                                                     (0.42, -0.28, 0.0, '#F7C6CF', 'cone'),
                                                     (-0.12, -0.2, 0.1, '#FFFFFF', 'scallop'),
                                                     (0.14, -0.2, 0.1, '#F9D9A8', 'scallop'),
                                                     (0.0, -0.36, 0.0, '#F7C6CF', 'scallop'))):
            B.shell(mb, (x + dx, y + dy, z), s=0.045, col=col, rz=k * 40, kind=kind)
        mb.done('shells')
        B.starfish('star', (x + 0.3, y - 0.2, 0.17), r=0.07, col='#F49A5A', rz=20, t=0.03, tilt=(70, 0))


def castle_l(seed=0):
    m = B.sand(B.SAND_DAMP)
    B.sand_mound('base', 1.0, 0.1, (0, 0, 0), seed=seed + 1, col=B.SAND_DAMP)
    # moat ring with a little water + a plank bridge
    wm = B.water_mat('moat', '#8FD8E2', alpha=0.9, rough=0.05)
    B.torus('moat', 0.78, 0.07, (0, 0, 0.0), mats=[wm], M=48, K=10, scale=(1, 1, 0.25))
    B.torus('moatrim', 0.88, 0.05, (0, 0, 0.03), mats=[m], M=48, K=8, scale=(1, 1, 0.5))
    box('bridge', (0.16, 0.34, 0.025), (0.0, -0.78, 0.035), mat=B.teak(B.DRIFT, along='Y'), bevel=0.006)
    # platform + 4 corner towers + walls
    box('plinth', (0.98, 0.98, 0.12), (0, 0, 0.0), mat=m, bevel=0.05)
    cs = [(-0.42, -0.42), (0.42, -0.42), (0.42, 0.42), (-0.42, 0.42)]
    for k, (cx, cy) in enumerate(cs):
        B.tower_bucket('ct%d' % k, (cx, cy, 0.1), r=0.13, h=0.28, mat=m, seed=seed + k)
    for k in range(4):
        a, b_ = cs[k], cs[(k + 1) % 4]
        mid = ((a[0] + b_[0]) / 2, (a[1] + b_[1]) / 2)
        horiz = abs(a[1] - b_[1]) < 1e-3
        box('w%d' % k, (0.7 if horiz else 0.08, 0.08 if horiz else 0.7, 0.16), (mid[0], mid[1], 0.1), mat=m,
            bevel=0.025)
        mb = L2.MB()
        for j in range(6):
            t = (j + 0.5) / 6
            px = a[0] + (b_[0] - a[0]) * t
            py = a[1] + (b_[1] - a[1]) * t
            mb.cube((0.05, 0.05, 0.04), m, loc=(px, py, 0.28))
        mb.done('wc%d' % k)
    sphere('gate', 0.07, (0, -0.47, 0.15), flat('#9B7B52', 0.95), scale=(1, 0.4, 1.3), segs=12, rings=8)
    # central keep: two stacked buckets + drip spire
    B.tower_bucket('keep', (0, 0.05, 0.1), r=0.22, h=0.3, mat=m, seed=seed, crenel=True)
    B.tower_bucket('keep2', (0, 0.05, 0.42), r=0.13, h=0.2, mat=m, seed=seed + 7, crenel=True)
    B.drip_spire('spire', (0, 0.05, 0.66), r=0.07, h=0.28, mat=m, seed=seed)
    for k, (cx, cy) in enumerate(cs):
        B.drip_spire('sp%d' % k, (cx, cy, 0.4), r=0.045, h=0.14, mat=m, seed=seed + k)
    for k, (fx, fy, z, col) in enumerate(((0, 0.05, 0.92, B.RED), (-0.42, -0.42, 0.52, B.BLUE),
                                          (0.42, 0.42, 0.52, B.YELLOW))):
        B.rod('fs%d' % k, (fx, fy, z - 0.02), (fx, fy, z + 0.22), 0.006, flat('#E9D9B8', 0.6), segs=6)
        B.pennant('fl%d' % k, (fx, fy, z + 0.215), 0.14, 0.09, col, rz=-30)
    mb = L2.MB()
    rnd = L.rng(seed + 11)
    for k in range(9):
        a = math.tau * k / 9 + 0.3
        rr = 0.98 + rnd.uniform(-0.04, 0.06)
        B.shell(mb, (rr * math.cos(a), rr * math.sin(a), 0.02), s=0.05, col=rnd.choice(['#F6E3D4', '#F7C6CF',
                                                                                        '#FFFFFF', '#F9D9A8']),
                rz=k * 40, kind='scallop' if k % 3 else 'cone')
    for (px, py) in ((-0.21, -0.47), (0.21, -0.47)):
        B.shell(mb, (px, py, 0.2), s=0.045, col='#FFFFFF', rz=0)
    mb.done('shells')
    B.starfish('star', (0.47, -0.08, 0.2), r=0.08, col='#F49A5A', rz=-10, t=0.03, tilt=(0, -70))
    sd = flat('#4E9A5E', 0.6)
    mbs = L2.MB()
    for k in range(5):
        a = -0.9 + k * 0.15
        mbs.seg((0.95 * math.cos(a), 0.95 * math.sin(a), 0.01), (1.05 * math.cos(a + 0.05), 1.05 * math.sin(a + 0.05),
                                                                  0.02), 0.012, sd, segs=5)
    mbs.done('weed')


@beach('sandcastle_s', 'decor', 'beach_play', fp=('r', 0.25), samples=40, notes=SC_NOTE % 'S (one bucket tower)',
       ko='모래성 (소)', en='Sandcastle S', zone='play')
def b_sandcastle_s():
    castle_s(seed=1)
    bucket_spade_pair(0.32, 0.12, rz=20)
    # diggers kneel on the FAR side (screen up) so the castle is drawn in front of them, facing it with a direction
    # beachfolk `dig` has frames for (S / SE / E, SW / W mirrored).  Polish: were in front, facing NE (no frames).
    mark('work', (-0.55, 0.05, 0.0), facing=(1, 0, 0))
    return {'extra': {'workDepth': 'behind'}}


@beach('sandcastle_m', 'decor', 'beach_play', fp=(1.1, 0.9), samples=40, notes=SC_NOTE % 'M (keep + 2 towers)',
       ko='모래성 (중)', en='Sandcastle M', zone='play')
def b_sandcastle_m():
    castle_m(seed=2)
    mark('work', (-0.85, 0.05, 0.0), facing=(1, 0, 0))
    mark('work', (0.05, 0.78, 0.0), facing=(0, -1, 0))
    return {'extra': {'workDepth': 'behind'}}


@beach('sandcastle_l', 'decor', 'beach_play', fp=(2.0, 2.0), samples=40,
       notes=SC_NOTE % 'L (4 towers, walls, keep, moat with water + plank bridge)', ko='모래성 (대)',
       en='Sandcastle L', zone='play')
def b_sandcastle_l():
    castle_l(seed=3)
    mark('work', (-1.28, 0.0, 0.0), facing=(1, 0, 0))
    mark('work', (0.0, 1.28, 0.0), facing=(0, -1, 0))
    mark('work', (-0.95, 0.95, 0.0), facing=(1, -1, 0))
    return {'extra': {'workDepth': 'behind'}}


def bucket_spade_pair(x, y, rz=0.0, col=B.RED, spade_col='#3D86D6', tip=False):
    if tip:
        B.bucket('bk', (x, y, 0.08), r=0.1, h=0.15, col=col, rot=(0, 75, rz), sand_in=False)
    else:
        B.bucket('bk', (x, y, 0.0), r=0.1, h=0.15, col=col)
    B.spade('sp', (x + 0.12, y - 0.14, 0.005), col=spade_col, rot=(0, 0, rz + 50))


BUILD_NOTE = ('Sandcastle being built: 4 stages sharing one frame + anchor (swap the frame in place as kids dig): '
              'sandcastle_build_0 = a dug pile of damp sand with a toppled bucket and a spade, _1 = smoothed mound + '
              'the first moulded tower, _2 = two towers and the front wall, _3 = finished castle with flag and '
              'shells (= a sandcastle_m look). workPoints / workDirs = two kneeling diggers (beachfolk `dig`, dirs SE '
              '/ SW) on the far side of the castle (workDepth "behind": normal y-sort draws the castle in front of '
              'them); stages lists every stage key in order.')


@beach('sandcastle_build', 'decor', 'beach_play', fp=(1.1, 0.9), samples=40, notes=BUILD_NOTE,
       ko='모래성 쌓기', en='Sandcastle (building)', zone='play',
       sprites=['sandcastle_build_0', 'sandcastle_build_1', 'sandcastle_build_2', 'sandcastle_build_3'])
def b_sandcastle_build():
    m = B.sand(B.SAND_DAMP)
    with L.Collect() as s0:
        B.sand_mound('pile', 0.34, 0.2, (0.0, 0.08, 0), seed=5, col=B.SAND_DAMP)
        B.sand_mound('pile2', 0.2, 0.11, (0.28, -0.08, 0), seed=6, col=B.SAND_DAMP)
        B.sand_mound('pile3', 0.14, 0.07, (-0.12, -0.26, 0), seed=7, col=B.SAND_DAMP)
        sphere('hole', 0.17, (-0.36, -0.06, 0.0), flat('#A88A5C', 0.95), scale=(1.15, 0.85, 0.1), segs=16, rings=8)
        B.torus('holerim', 0.18, 0.035, (-0.36, -0.06, 0.0), mats=[B.sand(B.SAND_DAMP)], M=24, K=8,
                scale=(1.15, 0.85, 0.8))
        B.spade('spst', (0.05, 0.12, 0.3), col='#3D86D6', rot=(-70, 0, 30))
    with L.Collect() as tools0:
        B.bucket('bk0', (0.45, -0.28, 0.08), r=0.1, h=0.15, col=B.RED, rot=(0, 75, 30), sand_in=False)
    with L.Collect() as s1:
        B.sand_mound('base', 0.55, 0.09, (0, 0, 0), seed=3, col=B.SAND_DAMP, scale=(1, 0.85, 1))
        B.tower_bucket('keep', (0, 0.05, 0.04), r=0.17, h=0.3, mat=m, seed=2, crenel=False)
    with L.Collect() as tools1:
        bucket_spade_pair(0.48, -0.32, rz=10)
    with L.Collect() as s2:
        for sx in (-1, 1):
            B.tower_bucket('tw%d' % sx, (sx * 0.32, -0.12, 0.02), r=0.11, h=0.22, mat=m, seed=2 + sx)
        box('wall', (0.5, 0.1, 0.13), (0, -0.14, 0.02), mat=m, bevel=0.03)
    with L.Collect() as s3:
        B.drip_spire('spire', (0, 0.05, 0.33), r=0.09, h=0.3, mat=m, seed=2)
        mb = L2.MB()
        for k in range(5):
            mb.cube((0.055, 0.1, 0.04), m, loc=(-0.2 + k * 0.1, -0.14, 0.17))
        mb.done('wcren')
        sphere('gate', 0.055, (0, -0.19, 0.05), flat('#9B7B52', 0.95), scale=(1, 0.4, 1.3), segs=12, rings=8)
        B.rod('fst', (0, 0.05, 0.6), (0, 0.05, 0.85), 0.006, flat('#E9D9B8', 0.6), segs=6)
        B.pennant('fl', (0, 0.05, 0.845), 0.14, 0.09, B.RED, rz=-30)
        mb2 = L2.MB()
        for k, (dx, dy, z, col, kind) in enumerate(((-0.4, -0.3, 0.0, '#F6E3D4', 'scallop'),
                                                     (-0.12, -0.2, 0.1, '#FFFFFF', 'scallop'),
                                                     (0.14, -0.2, 0.1, '#F9D9A8', 'scallop'))):
            B.shell(mb2, (dx, dy, z), s=0.045, col=col, rz=k * 40, kind=kind)
        mb2.done('shells')
    mark('work', (-0.85, 0.05, 0.0), facing=(1, 0, 0))
    mark('work', (0.05, 0.78, 0.0), facing=(0, -1, 0))
    groups = [s0.objs + tools0.objs, s1.objs + tools1.objs, s1.objs + s2.objs + tools1.objs,
              s1.objs + s2.objs + s3.objs + tools1.objs]
    every = BA.descendants(s0.objs + tools0.objs + s1.objs + tools1.objs + s2.objs + s3.objs)

    def setter(objs):
        def f():
            BA.show(every, False)
            BA.show(BA.descendants(objs), True)
        return f
    frames = [('sandcastle_build_%d' % k, setter(g)) for k, g in enumerate(groups)]
    keys = [n for n, _ in frames]
    sprites = {n: {'frame': n, 'stage': k, 'stages': keys} for k, n in enumerate(keys)}
    return {'frames': frames, 'sprites': sprites, 'extra': {'workDepth': 'behind'}}


# the rest of the set (registration order = manifest order inside each atlas)
import beach_props  # noqa: E402,F401
import beach_water  # noqa: E402,F401
