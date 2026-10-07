"""
harbor_water.py - seamless water-edge tiles and the buoy of the harbour city (docs/CONTRACT_V6.md section T):
pier_x / pier_y (+ pier_end_* sea ends and pier_root_* land ends), quay_x / quay_y / quay_corner (the stone quay wall
where the land drops to the sea), breakwater_x / breakwater_y (+ breakwater_end_*), buoy.

Tiles work like town_rails (seamless, integer steps):
  * one tile = SEG = sqrt(2) m along world X (step (+64, +32) px, screen down-right) or Y (step (+64, -32) px,
    screen up-right); the builder models a LONG continuous run (identical periodic geometry per segment, same seeds)
    and harbor_render clips the frame to the tile's strip;
  * harbor_pack cuts every open end with a partition-of-unity ramp (`cuts` in the sidecar, +-rampM around the tile
    border, alpha' = 1 - (1 - alpha)^w), so neighbouring tiles composite back to exactly the continuous run, baked
    shadow included;
  * the deck / coping top is z = 0 (walkable like the land), pilings / walls / stones go down to the sea surface
    harbor_lib.WATER_Z with white foam where they meet it; shadows fall on the sea plane.
Draw every tile on the GROUND layer (under characters, ships and buildings), like rail tiles.

Registered into harbor_assets.HARBOR (imported at the end of harbor_assets).
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
from harbor_assets import harbor, iso_px
from bld_assets import mark

SEG = H.SEG
RAMP = 0.1
PW = 2.0                        # pier width (m)
N_SIDE = 3                      # continuous segments modelled on each open side


def cuts_for(axis, ends):
    """World-axis partition cuts of a straight tile: [[axis, 'neg'|'pos', at_m], ...] for its open ends."""
    out = []
    if ends[0]:
        out.append([axis, 'neg', -SEG / 2])
    if ends[1]:
        out.append([axis, 'pos', SEG / 2])
    return out


def tile_res(axis, ends, extra=None, cuts=None):
    ex = {'tileLayer': 'ground'}
    ex.update(extra or {})
    return {'tile': {'axis': axis, 'seg': SEG, 'ramp': RAMP, 'ends': ends,
                     'cuts': cuts if cuts is not None else cuts_for(axis, ends)},
            'extra': ex, 'bounces': 4}


# =========================================================================== PIER

def pier_segment(k):
    """One SEG-long pier piece centred at u = k * SEG along local +X (deck top z = 0, width PW across Y)."""
    u0 = k * SEG
    a, b = u0 - SEG / 2, u0 + SEG / 2
    objs = H.deck_planks('plank%d' % k, a, b, -PW / 2 + 0.06, PW / 2 - 0.06, along='x', pitch=SEG / 6, seed=3,
                         period=6)
    edge = tonal('#8A5A33', 0.1, 4.0, rough=0.85)
    for s in (-1, 1):
        objs.append(box('curb%d' % k, (SEG, 0.15, 0.12), (u0, s * (PW / 2 - 0.075), 0.0), mat=edge, bevel=0.012))
        objs.append(box('stringer%d' % k, (SEG, 0.14, 0.2), (u0, s * (PW / 2 - 0.12), -0.28), mat=edge, bevel=0.012))
    objs.append(box('header%d' % k, (0.16, PW + 0.12, 0.16), (u0, 0.0, -0.26), mat=edge, bevel=0.015))
    for s in (-1, 1):
        objs += H.piling('pile%d_%d' % (k, s > 0), u0, s * (PW / 2 + 0.03), z_top=0.24, r=0.1, seed=5 + (s > 0))
        # X bracing between this piling and the next one along the side
        p0 = Vector((u0, s * (PW / 2 + 0.02), -0.16))
        p1 = Vector((u0 + SEG, s * (PW / 2 + 0.02), H.WATER_Z + 0.06))
        objs.append(H.beam('brace%d' % k, p0, p1, 0.06, edge))
    for j, (du, s, r) in enumerate(((0.25, 1, 0.16), (-0.4, -1, 0.12))):
        objs.append(LA.snow_drift('psn%d_%d' % (k, j), r, (u0 + du, s * (PW / 2 - 0.3), 0.0), seed=40 + j,
                                  scale=(1.7, 0.8, 0.28)))
    return objs


def pier_cap(u_end, sgn, kind):
    """Closed pier end at u_end (sgn +1: the run comes from -X).  kind 'end' = sea end (end curb, fender tyres,
    ladder, life-ring post); 'root' = land end (stone abutment flush with the quay)."""
    objs = []
    edge = tonal('#8A5A33', 0.1, 4.0, rough=0.85)
    if kind == 'end':
        objs.append(box('endcurb', (0.16, PW, 0.14), (u_end - sgn * 0.08, 0.0, 0.0), mat=edge, bevel=0.015))
        objs.append(box('endbeam', (0.16, PW + 0.1, 0.22), (u_end - sgn * 0.06, 0.0, -0.3), mat=edge, bevel=0.015))
        for s in (-1, 1):
            objs += H.piling('dolphin%d' % (s > 0), u_end + sgn * 0.02, s * (PW / 2 - 0.05), z_top=0.42, r=0.14,
                             seed=9 + (s > 0))
            objs.append(H.tyre('fender%d' % (s > 0), (u_end + sgn * 0.13, s * 0.45, -0.25), rot=(0, 90, 0)))
        # iron ladder down the end face to the water
        im = flat(H.IRON, 0.45, 0.4)
        for s in (-1, 1):
            objs.append(box('ladr', (0.04, 0.04, 0.7), (u_end + sgn * 0.05, s * 0.17, H.WATER_Z - 0.1), mat=im,
                            bevel=0.0))
            objs.append(box('ladt', (0.04, 0.04, 0.32), (u_end + sgn * 0.02, s * 0.17, 0.0), rot=(0, sgn * -25, 0),
                            mat=im, bevel=0.0))
        for j in range(3):
            objs.append(box('rung', (0.04, 0.38, 0.03), (u_end + sgn * 0.05, 0.0, H.WATER_Z + 0.02 + 0.17 * j),
                            mat=im, bevel=0.0))
        objs.append(H.foam_line('lfoam', (u_end + sgn * 0.06, -0.3), (u_end + sgn * 0.06, 0.3)))
        objs.append(cyl('rpost', 0.04, 0.62, (u_end - sgn * 0.25, PW / 2 - 0.25, 0.0), mat=flat(H.NAVY, 0.5),
                        segs=8))
        objs.append(H.life_ring('pring', (u_end - sgn * 0.25, PW / 2 - 0.25 - 0.05, 0.44), rz=0.0))
        objs.append(PA.snow_cap('rpsn', 0.05, (u_end - sgn * 0.25, PW / 2 - 0.25, 0.62), 0.03, 7))
    else:
        stone = snowy('#A9B0BB', lo=0.75, hi=0.9, noise_amt=0.4)
        objs.append(box('abut', (0.55, PW + 0.5, 0.75), (u_end + sgn * 0.2, 0.0, H.WATER_Z - 0.2), mat=stone,
                        bevel=0.04))
        objs.append(box('abcap', (0.6, PW + 0.55, 0.1), (u_end + sgn * 0.2, 0.0, -0.08), mat=flat('#C9CED6', 0.85),
                        bevel=0.03))
        for s in (-1, 1):
            objs.append(H.foam_line('afoam%d' % (s > 0), (u_end - sgn * 0.08, s * (PW / 2 + 0.26)),
                                    (u_end + sgn * 0.5, s * (PW / 2 + 0.26))))
    return objs


def build_run(segment, ends, cap, axis='x', n_side=N_SIDE):
    """Continuous run along local X: segments k0..k1 (+ caps at closed ends)."""
    k0 = -n_side if ends[0] else 0
    k1 = n_side if ends[1] else 0
    for k in range(k0, k1 + 1):
        segment(k)
    if not ends[1] and cap:
        cap(SEG / 2, +1)
    if not ends[0] and cap:
        cap(-SEG / 2, -1)


PIER_NOTE = ('Pier tile (sqrt(2) m along world %s, deck %.1f m wide, deck top = quay level z 0): weathered plank deck '
             'with dark curbs, timber pilings poking up at the edges with snow caps, X bracing and foam rings where '
             'the pilings meet the sea (WATER_Z, 30 px lower). Tiles join seamlessly %s px apart. %s Ground layer: '
             'characters walk on it with no lift; ships moor beside it on the water plane (moorPoints).')
PIER_VARIANTS = {
    'pier_x': ('x', (True, True), None, 'Straight piece.'),
    'pier_y': ('y', (True, True), None, 'Straight piece.'),
    'pier_end_xp': ('x', (True, False), 'end', 'Sea end at +X (screen down-right): end curb, two dolphins with tyre '
                                               'fenders, iron ladder to the water, life ring.'),
    'pier_end_xn': ('x', (False, True), 'end', 'Sea end at -X (screen up-left).'),
    'pier_end_yp': ('y', (True, False), 'end', 'Sea end at +Y (screen up-right).'),
    'pier_end_yn': ('y', (False, True), 'end', 'Sea end at -Y (screen down-left; the usual end of a pier that leaves '
                                               'a -Y waterfront).'),
    'pier_root_xp': ('x', (True, False), 'root', 'Land end at +X: stone abutment; put its end line (anchor + half a '
                                                 'tile along +X) on the quay edge.'),
    'pier_root_xn': ('x', (False, True), 'root', 'Land end at -X: stone abutment on the quay edge (a pier leaving a '
                                                 '+X waterfront).'),
    'pier_root_yp': ('y', (True, False), 'root', 'Land end at +Y: stone abutment on the quay edge (a pier leaving a '
                                                 '-Y waterfront).'),
    'pier_root_yn': ('y', (False, True), 'root', 'Land end at -Y.'),
}


def _pier_builder(key, axis, ends, cap_kind):
    def fn():
        build_run(pier_segment, ends, (lambda u, s: pier_cap(u, s, cap_kind)) if cap_kind else None)
        # mooring spots along both long sides on the water (ship anchors beside the pier) - world coords after yaw
        for s in (-1, 1):
            mark('moor', (0.0, s * (PW / 2 + 0.25), H.WATER_Z))
        if cap_kind == 'end':
            mark('ladder', ((SEG / 2 + 0.05) * (1 if not ends[1] else -1), 0.0, 0.0))
        return tile_res(axis, ends, extra={'pierWidthM': PW, 'capKind': cap_kind or 'none',
                                           'deckTop': 0.0})
    return fn


for _k, (_ax, _ends, _cap, _txt) in PIER_VARIANTS.items():
    harbor(_k, 'decal', 'harbor_water', fp=(SEG, PW) if _ax == 'x' else (PW, SEG), yaw=0.0 if _ax == 'x' else 90.0,
           catcher=30.0, samples=40, ground='water', front=None,
           notes=PIER_NOTE % (_ax.upper(), PW, '(+64, +32)' if _ax == 'x' else '(+64, -32)', _txt),
           ko='부두', en='Pier', zone='water')(_pier_builder(_k, _ax, _ends, _cap))


# =========================================================================== QUAY WALL

QW_DEPTH = 0.42                 # coping band depth on the land side


def quay_segment(k, lo=None, hi=None):
    """One SEG piece of quay wall along local X: the wall face at y = 0 faces -Y (the sea), land at +Y.
    lo / hi clip the piece (quay_corner); the block layout always follows the global periodic pattern."""
    u0 = k * SEG
    a, b = u0 - SEG / 2, u0 + SEG / 2
    a2 = a if lo is None else max(a, lo)
    b2 = b if hi is None else min(b, hi)
    objs = H.stone_blocks_wall('qblk%d' % k, a2, b2, H.WATER_Z - 0.12, -0.1, 0.0, along='x', course_h=0.27,
                               block_l=SEG / 3, depth=0.36, seed=2, period=SEG)
    cm = [flat('#C9CED6', 0.85), flat('#BEC4CD', 0.85)]
    for j in range(2):
        x0, x1 = a + j * SEG / 2, a + (j + 1) * SEG / 2
        x0, x1 = max(x0, a2), min(x1, b2)
        if x1 - x0 < 0.05:
            continue
        objs.append(box('cope%d_%d' % (k, j), (x1 - x0 - 0.02, QW_DEPTH + 0.06, 0.12),
                        ((x0 + x1) / 2, QW_DEPTH / 2 - 0.05, -0.12), mat=cm[j], bevel=0.035))
    objs.append(box('wet%d' % k, (b2 - a2, 0.02, 0.13), ((a2 + b2) / 2, -0.012, H.WATER_Z - 0.04),
                    mat=flat('#3E5652', 0.9), bevel=0.0))
    objs.append(H.foam_line('qfoam%d' % k, (a2, -0.06), (b2, -0.06)))
    if a2 <= u0 + 0.3 <= b2:
        objs.append(PA.snow_cap('qsn%d' % k, 0.12, (u0 + 0.3, 0.2, -0.0), 0.05, 3, scale=(2.2, 0.9, 1.0)))
    return objs


QUAY_NOTE = ('Quay wall tile (sqrt(2) m along world %s): granite coping (%.2f m on the land side, top = z 0) over a '
             'dressed stone wall dropping 0.55 m to the sea, dark wet band + foam line at the waterline. %s Tiles join '
             'seamlessly %s px apart; draw on the ground layer along the land edge (the land texture stops at the '
             'anchor line, the sea texture starts there).')


def _quay_builder(axis):
    def fn():
        build_run(quay_segment, (True, True), None)
        return tile_res(axis, (True, True), extra={'copingM': QW_DEPTH, 'faceSide': '-Y' if axis == 'x' else '+X'})
    return fn


harbor('quay_x', 'decal', 'harbor_water', fp=(SEG, 0.5), yaw=0.0, catcher=30.0, ground='water', front=None,
       notes=QUAY_NOTE % ('X', QW_DEPTH, 'Sea on the -Y side (screen down-left), land on +Y.', '(+64, +32)'),
       ko='안벽', en='Quay wall', zone='water')(_quay_builder('x'))
harbor('quay_y', 'decal', 'harbor_water', fp=(0.5, SEG), yaw=90.0, catcher=30.0, ground='water', front=None,
       notes=QUAY_NOTE % ('Y', QW_DEPTH, 'Sea on the +X side (screen down-right), land on -X.', '(+64, -32)'),
       ko='안벽', en='Quay wall', zone='water')(_quay_builder('y'))


CORNER_NOTE = ('Outer quay corner: the land quadrant x < 0, y > 0 (screen up) meets the sea on the -Y AND +X sides; '
               'anchor = the corner point at z 0. Chain quay_x tiles toward -X with their centres at (-64, -32) px * n '
               'from this anchor (n = 1, 2 ...) and quay_y tiles toward +Y with centres at (+64, -32) px * n; the joins '
               'are seamless (cuts at half a tile on both arms). A rounded granite corner stone + a bollard-like '
               'corner post.')


@harbor('quay_corner', 'decal', 'harbor_water', fp=(1.2, 1.2), catcher=30.0, ground='water', front=None,
        notes=CORNER_NOTE, ko='안벽 모서리', en='Quay corner', zone='water')
def b_quay_corner():
    # X arm: the wall along X for x <= 0 (face y = 0 toward -Y), same global layout as quay_x
    for k in range(-N_SIDE, 1):
        quay_segment(k, hi=0.0)
    # Y arm: the same run clipped to local u >= 0, turned +90 deg (local -Y face -> world +X, local +X -> world +Y)
    with L.Collect() as yc:
        for k in range(0, N_SIDE + 1):
            quay_segment(k, lo=0.0)
    BA.regroup(yc.objs, 'yarm', rot=(0, 0, 90))
    cyl('cstone', 0.3, -H.WATER_Z + 0.0, (-0.04, 0.04, H.WATER_Z - 0.12), mat=tonal('#8E96A3', 0.08, 5.0, rough=0.9),
        segs=24, bevel=0.03)
    cyl('ccap', 0.36, 0.13, (-0.06, 0.06, -0.12), mat=flat('#C9CED6', 0.85), segs=28, bevel=0.035)
    H.foam_ring('cfoam', -0.04, 0.04, 0.33)
    H.bollard_model('cbol', (-0.16, 0.16, 0.0), s=0.85, seed=3)
    return tile_res('x', (True, True), extra={'cornerArms': {'x': 'neg', 'y': 'pos'}},
                    cuts=[['x', 'neg', -SEG / 2], ['y', 'pos', SEG / 2]])


# =========================================================================== BREAKWATER

BW_CROWN = 1.3                  # walkable concrete crown width


def breakwater_segment(k):
    u0 = k * SEG
    a, b = u0 - SEG / 2, u0 + SEG / 2
    objs = []
    crown = L.stripes('#AEB5BF', '#A4ABB6', 1.0 / (SEG / 4), 'X', rough=0.9, soft=0.04)
    objs.append(box('crown%d' % k, (SEG, BW_CROWN, 0.5), (u0, 0.0, -0.5), mat=crown, bevel=0.0))
    objs.append(box('cjoint%d' % k, (0.03, BW_CROWN + 0.01, 0.01), (a, 0.0, -0.005), mat=flat('#9AA1AC', 0.9),
                    bevel=0.0))
    objs.append(box('para%d' % k, (SEG, 0.3, 0.42), (u0, BW_CROWN / 2 + 0.1, 0.0), mat=flat('#C9CED6', 0.85),
                    bevel=0.0))
    objs.append(L.snow_slab('parasn%d' % k, SEG, 0.26, 0.06, (u0, BW_CROWN / 2 + 0.1, 0.42), seed=4))
    objs.append(LA.snow_drift('csn%d' % k, 0.18, (u0 + 0.25, BW_CROWN / 2 - 0.2, 0.0), seed=44, scale=(1.8, 0.8, 0.3)))
    rnd = L.rng(17)
    for s in (-1, 1):
        for j in range(2):
            uu = a + (j + 0.5) * SEG / 2 + rnd.uniform(-0.1, 0.1)
            vv = s * (BW_CROWN / 2 + 0.42 + rnd.uniform(-0.05, 0.08))
            rot = (rnd.uniform(0, 360), rnd.uniform(0, 360), rnd.uniform(0, 360))
            objs.append(H.tetrapod('tp%d_%d_%d' % (k, s > 0, j), (uu, vv, H.WATER_Z + 0.22), rot=rot, s=0.95,
                                   col='#8E99A8'))
            objs.append(H.foam_ring('tpf%d_%d_%d' % (k, s > 0, j), uu, vv + s * 0.15, 0.38))
        for j in range(3):
            uu = a + (j + 0.3) * SEG / 3 + rnd.uniform(-0.05, 0.05)
            vv = s * (BW_CROWN / 2 + 0.95 + rnd.uniform(-0.05, 0.1))
            objs.append(blob('bst%d_%d_%d' % (k, s > 0, j), rnd.uniform(0.18, 0.26), (uu, vv, H.WATER_Z + 0.02),
                             snowy('#7D8592', lo=0.6, hi=0.85), scale=(1.3, 1.0, 0.8), seed=60 + j, amp=0.3, subdiv=2))
    return objs


def breakwater_cap(u_end, sgn):
    objs = []
    crown = flat('#AEB5BF', 0.9)
    objs.append(cyl('bhead', BW_CROWN / 2 + 0.2, 0.5, (u_end, 0.0, -0.5), mat=crown, segs=32, bevel=0.0))
    rnd = L.rng(23)
    for j in range(5):
        a = math.radians(-70 + 35 * j) if sgn > 0 else math.radians(110 + 35 * j)
        r = BW_CROWN / 2 + 0.55
        p = (u_end + r * math.cos(a), r * math.sin(a), H.WATER_Z + 0.2)
        objs.append(H.tetrapod('tph%d' % j, p, rot=(rnd.uniform(0, 360), rnd.uniform(0, 360), rnd.uniform(0, 360)),
                               s=1.0, col='#8E99A8'))
        objs.append(H.foam_ring('tphf%d' % j, p[0] + 0.12 * math.cos(a), p[1] + 0.12 * math.sin(a), 0.4))
    # little green harbour light on the head
    cyl('blbase', 0.22, 0.12, (u_end, 0.0, 0.0), mat=flat('#C9CED6', 0.8), segs=20, bevel=0.03)
    cyl('bltower', 0.14, 1.15, (u_end, 0.0, 0.1), mat=L.stripes('#3E9A5A', H.HWHITE, 1.0 / 0.5, 'Z', soft=0.01),
        segs=20, r_top=0.11, bevel=0.02)
    lamp = L.emissive('bllamp', '#9CF0B0', '#7CF29A', 1.6)
    cyl('bllamp', 0.1, 0.18, (u_end, 0.0, 1.26), mat=lamp, segs=16, bevel=0.02)
    cyl('blcap', 0.15, 0.1, (u_end, 0.0, 1.44), mat=flat('#3E9A5A', 0.5), segs=16, r_top=0.03, bevel=0.02)
    PA.snow_cap('blsn', 0.09, (u_end, 0.0, 1.5), 0.04, 5)
    H.gull('blgull', (u_end + 0.25, 0.25, 0.0), rz=200.0, s=0.9)
    return objs


BW_NOTE = ('Breakwater tile (sqrt(2) m along world %s): concrete crown %.1f m wide at quay level (walkable, z 0) with a '
           'low parapet on the %s side, cute tetrapods and snowy boulders on both slopes, foam at the waterline. %s '
           'Tiles join seamlessly %s px apart; ground layer.')
BW_VARIANTS = {
    'breakwater_x': ('x', (True, True), 'Straight piece.'),
    'breakwater_y': ('y', (True, True), 'Straight piece.'),
    'breakwater_end_xp': ('x', (True, False), 'Round head at +X with a little green harbour light.'),
    'breakwater_end_yn': ('y', (False, True), 'Round head at -Y with a little green harbour light.'),
}


def _bw_builder(axis, ends):
    def fn():
        build_run(breakwater_segment, ends, breakwater_cap)
        res = tile_res(axis, ends, extra={'crownM': BW_CROWN})
        if not all(ends):
            res['fx'] = {'light': ((SEG / 2 if not ends[1] else -SEG / 2), 0.0, 1.35)}
        return res
    return fn


for _k, (_ax, _ends, _txt) in BW_VARIANTS.items():
    harbor(_k, 'decal', 'harbor_water', fp=(SEG, 3.6) if _ax == 'x' else (3.6, SEG), yaw=0.0 if _ax == 'x' else 90.0,
           catcher=30.0, ground='water', front=None,
           notes=BW_NOTE % (_ax.upper(), BW_CROWN, '+Y (screen up-right)' if _ax == 'x' else '-X (screen up-left)',
                            _txt, '(+64, +32)' if _ax == 'x' else '(+64, -32)'),
           ko='방파제', en='Breakwater', zone='water')(_bw_builder(_ax, _ends))


# =========================================================================== BUOY

BUOY_NOTE = ('Navigation buoy (~1.7 m above the water). Its anchor is its WATERLINE centre (like assets/ships): put '
             'it on a sea point that is already on the water plane (e.g. 30 px below a deck-level point). Red float '
             'with a white band, lattice top with a blinking lamp and a radar reflector, a seagull riding on top. idle = still, lamp off; anims.work / anims.bob = 4-frame bobbing '
             'loop (rises / tilts, foam ring pulses, lamp blinks on frame 1). Ground layer is NOT needed: depth-sort '
             'by anchor y like a ship.')


@harbor('buoy', 'decor', 'harbor_water', fp=('r', 0.45), catcher=12.0, work=4, fps=4, ground='land', front=None,
        notes=BUOY_NOTE, ko='부표', en='Buoy', zone='water', anim_name='bob', samples=48)
def b_buoy():
    Z = 0.0                     # modelled with its waterline at z 0 = the sprite anchor (like a ship)
    with L.Collect() as bc_:
        red = flat(H.HRED, 0.4)
        cyl('float', 0.36, 0.5, (0, 0, Z - 0.22), mat=red, segs=32, r_top=0.32, bevel=0.06)
        cyl('band', 0.335, 0.12, (0, 0, Z + 0.1), mat=flat(H.HWHITE, 0.45), segs=32, bevel=0.02)
        cyl('deck', 0.3, 0.06, (0, 0, Z + 0.28), mat=flat('#3A3E46', 0.5), segs=28, bevel=0.02)
        mb = L.MB()
        im = flat(H.HRED, 0.4)
        for k in range(4):
            a = math.tau * k / 4 + math.pi / 4
            mb.seg((0.24 * math.cos(a), 0.24 * math.sin(a), Z + 0.32), (0.07 * math.cos(a), 0.07 * math.sin(a),
                                                                         Z + 1.05), 0.03, im, segs=8)
        for z, r in ((Z + 0.55, 0.18), (Z + 0.8, 0.12)):
            T.ring_seg(mb, (0, 0, z), r, 0.02, im, axis='z', n=16)
        mb.done('cage')
        lamp_m = L.emissive('buoylamp', '#FFE9A0', '#FFD45A', 0.0)
        cyl('lamp', 0.09, 0.16, (0, 0, Z + 1.06), mat=lamp_m, segs=16, bevel=0.02)
        cyl('lcap', 0.12, 0.06, (0, 0, Z + 1.22), mat=flat('#3A3E46', 0.5), segs=16, r_top=0.05, bevel=0.015)
        # radar reflector (three crossed plates) + gull
        for r in ((0, 0, 0), (0, 0, 90), (90, 0, 0)):
            box('refl', (0.18, 0.01, 0.18), (0, 0, Z + 1.36), rot=r, mat=flat('#C9CED6', 0.3, 0.7), bevel=0.0,
                origin='center')
        H.gull('bgull', (0.05, 0.0, Z + 1.47), rz=-120.0, s=0.9)
        PA.snow_cap('bsn', 0.16, (0.0, 0.0, Z + 0.31), 0.04, 3)
    body = L.group(BA.top_level(bc_.objs), 'buoy', loc=(0, 0, 0))
    foam = H.foam_ring('bfoam', 0, 0, 0.38, z=Z, w=0.06, alpha=0.8)
    foam2 = H.foam_ring('bfoam2', 0, 0, 0.55, z=Z, w=0.035, alpha=0.45)
    chain = H.beam('chain', (0.3, 0.0, Z + 0.0), (0.55, 0.0, Z - 0.4), 0.03, flat('#3A3E46', 0.5))
    BOB = [(0.0, 0.0, 0.0), (0.05, 4.0, 2.0), (0.0, 0.0, 0.0), (-0.04, -4.0, -2.5)]

    def idle():
        body.location.z = 0.0
        body.rotation_euler = (0.0, 0.0, 0.0)
        L.set_emission(lamp_m, 0.0)
        foam.scale = (1.0, 1.0, 0.25)
        foam2.scale = (1.0, 1.0, 0.25)

    def work(i):
        dz, tx, ty = BOB[i]
        body.location.z = dz
        body.rotation_euler = (math.radians(tx), math.radians(ty), 0.0)
        L.set_emission(lamp_m, 6.0 if i == 1 else 0.6)
        s = [1.0, 1.08, 1.0, 0.94][i]
        foam.scale = (s, s, 0.25)
        s2 = [1.0, 1.12, 1.22, 1.08][i]
        foam2.scale = (s2, s2, 0.25)

    del chain
    idle()
    return {'idle': idle, 'work': work, 'fx': {'light': (0.0, 0.0, Z + 1.14)},
            'extra': {'onWater': True, 'waterline': 'anchor'}}
