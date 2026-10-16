"""
ch2_build.py - the chief (player rig) for the v4.2 chief anims (CONTRACT_V42 AH, assets/chief2).

Not run directly: ch2_render.py imports build() and apply().

build() returns EXACTLY the `player` rig of assets/characters (char_build.build('player'): same body,
white fur parka, brown belt + satchel, boots, hair, materials) and only ADDS hidden extras that the new
anims switch on through the pose's '_show' set:

  faces    face_blink    closed eyes (lower arcs) + the small smile            (blinks, sit_idle, talk)
           face_sleep    closed eyes + a tiny round 'o' mouth                  (doze)
           face_content  happy arc eyes + the small smile (cosy, no open mouth) (warm_hands)
           face_mid      open eyes + a half-open mouth                         (talk)
  props    quill         teal goose quill with a cream shaft and a dark nib    (sit_write, right mitten)
           stamp         varnished wooden desk stamp with a red rubber pad     (sit_write, left mitten)
           paper         folded / opened newspaper, cream with grey column lines, a dark masthead band
                         and a blue-grey photo box - no text                    (sit_read, both mittens)
           bowl          red lacquer soup bowl with golden stew                 (sit_eat, left mitten)
           spoon         wooden spoon (+ 'spoon_food', a dab of stew)           (sit_eat, right mitten)
           pennant       little teal 서리마을 cheer pennant with a cream snowflake on a light wooden
                         stick with a brass knob - no text                       (cheer, right mitten)

Nothing of the original player is moved, re-coloured or re-shaped, so the char_player frames keep their
look (they are never re-rendered by this job anyway).

Props are children of the ROOT (they turn with the facing) and are placed per frame by the pose
('_props': {name: (loc, rot_deg)} in root-local metres, loc = the prop's BUSINESS point: the quill nib,
the stamp's rubber face, the spoon tip, the bowl's foot, the paper's fold centre). The mitten that holds
a prop is then IK-solved onto the prop's grip point, so props never float away from the hands.

Root-local frame (= the character's own): +X = his left, -Y = forward (his facing), +Z = up.
Standing anims: origin = ground under the feet.  Seated anims: origin = the SEAT POINT (seat
front-centre on top of a 0.45 m seat, the townfolk2 / officefolk / life2 `seatPoints` convention).
"""
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

import bpy                      # noqa: E402
import bmesh                    # noqa: E402
import numpy as np              # noqa: E402
from mathutils import Vector, Matrix, Quaternion, Euler   # noqa: E402

import bl_common as bc          # noqa: E402
import char_build as cb         # noqa: E402
import char_geo as g            # noqa: E402

PI = math.pi
M = cb.M

# prop palette (reads on the white parka and on snow)
QUILL = '#1F86AE'          # teal-blue feather (office teal family, never white on white)
QUILL_TIP = '#13557A'
QUILL_SHAFT = '#F3E8C8'
NIB = '#2B2A33'
STAMP_WOOD = '#8E4F27'
STAMP_KNOB = '#B86A35'
STAMP_RUBBER = '#D8392F'
STAMP_BRASS = '#D9A83A'
BOWL = '#DA5539'
BOWL_IN = '#F4E9D2'
STEW = '#E8962F'
SPOON = '#D9A066'
PENNANT_STICK_C = '#EBD3A2'     # light birch stick (reads on the dark hair and the white parka)
PENNANT_KNOB_C = '#D9A83A'      # brass knob (STAMP_BRASS)
PENNANT_TEAL = (31, 134, 174)   # the quill / office teal (QUILL)
PENNANT_EDGE = (19, 85, 122)    # QUILL_TIP: a darker hem along the flying edges
PENNANT_FLAKE = (246, 238, 220) # cream snowflake
PAPER = (238, 228, 202)
INK_DARK = (52, 56, 72)
INK_MID = (104, 106, 118)
INK_LIGHT = (146, 146, 152)
PHOTO = (96, 132, 172)

# newspaper size (one page; the open spread is 2 W wide)
PAPER_W = 0.240
PAPER_H = 0.270

# grip points in each prop's local frame (where the mitten centre goes)
GRIPS = {
    'quill': ('R', (0.0, 0.0, 0.062)),      # up the shaft from the nib (x QUILL_SCALE = 8 cm)
    'stamp': ('L', (0.0, 0.0, 0.118)),      # on the round knob
    'spoon': ('R', (0.0, 0.0, 0.135)),      # end of the handle
    'bowl': ('L', (0.088, 0.0, 0.040)),     # the mitten cups the bowl's left side
}


# --------------------------------------------------------------------------- build

def build():
    rig = cb.build('player')          # the untouched player rig (char_build.SPECS['player'])
    rig.meta['key'] = 'player_b'
    add_faces(rig)
    rig.meta['props'] = {}
    make_quill(rig)
    make_stamp(rig)
    make_paper(rig)
    make_bowl(rig)
    make_spoon(rig)
    make_pennant(rig)
    _hose_setup(rig)
    return rig


def _objs(rig, toggle, pred):
    return [o for o in rig.toggles.get(toggle, []) if pred(o.name)]


def add_faces(rig):
    spec = cb.SPECS['player']
    head = rig.j['head']
    eye_m = M('eye', spec.get('eye', cb.EYE), rough=0.25)
    mouth_m = M('mouth', cb.MOUTH, rough=0.5)
    ex, ey = spec.get('eye_spread', 0.37), spec.get('eye_el', -0.10)
    es = spec.get('eye_size', 1.12)
    closed = []
    for s in (-1, 1):
        closed.append(cb.on_head('eye_closed', cb.arc_bm(0.033 * es, 0.0100, PI + 0.32, 2 * PI - 0.32), eye_m,
                                 head, s * ex, ey - 0.035, out=-0.002))
    m_o = cb.on_head('mouth_o', g.bm_ellipsoid(0.017, 0.009, 0.019, 12, 8), mouth_m, head, 0.0, -0.345,
                     out=-0.004)
    m_mid = cb.on_head('mouth_mid', g.bm_ellipsoid(0.027, 0.010, 0.014, 12, 8), mouth_m, head, 0.0, -0.345,
                       out=-0.004)
    eyes_open = _objs(rig, 'face_normal', lambda n: n.startswith('eye'))
    m_small = _objs(rig, 'face_normal', lambda n: n.startswith('mouth'))
    eyes_happy = _objs(rig, 'face_happy', lambda n: n.startswith('eye_happy'))
    assert len(eyes_open) == 4 and len(m_small) == 1 and len(eyes_happy) == 2, (eyes_open, m_small, eyes_happy)
    rig.toggle('face_blink', closed + m_small)
    rig.toggle('face_sleep', closed + [m_o])
    rig.toggle('face_content', eyes_happy + m_small)
    rig.toggle('face_mid', eyes_open + [m_mid])


def _prop_root(rig, name):
    e = g.empty(name + '_obj', rig.j['root'], (0, 0, 0))
    rig.meta['props'][name] = e
    return e


QUILL_SCALE = 1.3


def make_quill(rig):
    """Goose quill: origin = the nib tip, shaft along +Z, feather vane curving back (chibi prop scale 1.3)."""
    t = _prop_root(rig, 'quill')
    t.scale = (QUILL_SCALE, QUILL_SCALE, QUILL_SCALE)
    objs = [g.mesh_obj('quill_nib', g.bm_lathe([(0.0, 0.0), (0.0065, 0.022), (0.0075, 0.030), (0.0, 0.031)],
                                               seg=10), M('quill_nib', NIB, rough=0.35, metal=0.3), t)]
    objs.append(g.mesh_obj('quill_shaft', g.bm_lathe([(0.0, 0.026), (0.0068, 0.030), (0.0060, 0.20),
                                                      (0.0, 0.215)], seg=10, smooth_n=8),
                           M('quill_shaft', QUILL_SHAFT, rough=0.5), t))
    # feather vane: a flattened, tapered tube along a slight curve (bends toward +Y = back)
    pts = [(0.0, 0.024 * (k / 11) ** 2, 0.070 + 0.23 * k / 11) for k in range(12)]
    vane = g.bm_tube_path(pts, lambda u: 0.006 + 0.040 * math.sin(PI * min(1.0, u * 1.12)) ** 0.7, segr=10,
                          side_ref=(0, 1, 0), flat=0.20)
    objs.append(g.mesh_obj('quill_vane', vane, M('quill_vane', QUILL, rough=0.55), t))
    tip = [(0.0, 0.024 + 0.03 * (k / 5) ** 2, 0.27 + 0.05 * k / 5) for k in range(6)]
    objs.append(g.mesh_obj('quill_tip', g.bm_tube_path(tip, lambda u: 0.026 * (1 - u) + 0.003, segr=8,
                                                       side_ref=(0, 1, 0), flat=0.22),
                           M('quill_tipc', QUILL_TIP, rough=0.55), t))
    rig.toggle('quill', objs)


def make_stamp(rig):
    """Desk stamp: origin = centre of the rubber face (the contact point), knob up +Z."""
    t = _prop_root(rig, 'stamp')
    wood = M('stamp_wood', STAMP_WOOD, rough=0.35)
    objs = [g.mesh_obj('stamp_rubber', g.bm_box(0.078, 0.056, 0.014, bevel=0.004), M('stamp_rubber', STAMP_RUBBER,
                                                                                      rough=0.6), t,
                       loc=(0, 0, 0.007)),
            g.mesh_obj('stamp_block', g.bm_box(0.086, 0.062, 0.030, bevel=0.008), wood, t, loc=(0, 0, 0.029)),
            g.mesh_obj('stamp_band', g.bm_box(0.090, 0.066, 0.008, bevel=0.003),
                       M('stamp_brass', STAMP_BRASS, rough=0.3, metal=0.6), t, loc=(0, 0, 0.040)),
            g.mesh_obj('stamp_neck', g.bm_lathe([(0.020, 0.044), (0.013, 0.070), (0.012, 0.090), (0.018, 0.100),
                                                 (0.0, 0.102)], seg=14, smooth_n=8), wood, t),
            g.mesh_obj('stamp_knob', g.bm_ellipsoid(0.031, 0.031, 0.028, 16, 10),
                       M('stamp_knob', STAMP_KNOB, rough=0.3), t, loc=(0, 0, 0.122))]
    cb.fx_marker(rig, 'stamp', t, (0, 0, 0))
    rig.toggle('stamp', objs)


def make_bowl(rig):
    """Soup bowl: origin = centre of the foot (sits on the table top)."""
    t = _prop_root(rig, 'bowl')
    prof = [(0.0, 0.0), (0.040, 0.0), (0.044, 0.008), (0.066, 0.022), (0.080, 0.045), (0.084, 0.062),
            (0.080, 0.064), (0.074, 0.050), (0.060, 0.030), (0.0, 0.026)]
    objs = [g.mesh_obj('bowl', g.bm_lathe(prof, seg=32, smooth_n=0, cap_bottom=False, cap_top=False),
                       M('bowl_red', BOWL, rough=0.25), t)]
    # cream rim band + the stew surface with a few bits
    objs.append(g.mesh_obj('bowl_rim', g.bm_ring(0.082, 0.0055, seg=40, segr=8), M('bowl_in', BOWL_IN, rough=0.4),
                           t, loc=(0, 0, 0.0625)))
    objs.append(g.mesh_obj('bowl_stew', g.bm_lathe([(0.0, 0.052), (0.074, 0.052), (0.0, 0.0521)], seg=32),
                           M('stew', STEW, rough=0.35), t))
    bits = [((0.025, -0.020, 0.056), '#6CA644'), ((-0.030, 0.010, 0.056), '#F6EEDC'),
            ((0.005, 0.030, 0.056), '#D2453A'), ((-0.012, -0.034, 0.056), '#F6EEDC'),
            ((0.036, 0.020, 0.056), '#6CA644')]
    for k, (p, col) in enumerate(bits):
        objs.append(g.mesh_obj('bowl_bit', g.bm_ellipsoid(0.013, 0.011, 0.007, 10, 6), M('bit%d' % k, col, rough=0.5),
                               t, loc=p))
    rig.toggle('bowl', objs)


def make_spoon(rig):
    """Wooden spoon: origin = the middle of the spoon's bowl, handle along +Z."""
    t = _prop_root(rig, 'spoon')
    wood = M('spoon_wood', SPOON, rough=0.45)
    objs = [g.mesh_obj('spoon_head', g.bm_ellipsoid(0.024, 0.032, 0.009, 14, 8), wood, t, rot=(-70, 0, 0)),
            g.mesh_obj('spoon_handle', g.bm_lathe([(0.0, 0.020), (0.008, 0.026), (0.0075, 0.15), (0.010, 0.165),
                                                   (0.0, 0.175)], seg=10, smooth_n=8), wood, t)]
    rig.toggle('spoon', objs)
    food = g.mesh_obj('spoon_food', g.bm_ellipsoid(0.020, 0.022, 0.011, 12, 8), M('stew', STEW, rough=0.35), t,
                      loc=(0, -0.004, 0.008), rot=(-70, 0, 0))
    rig.toggle('spoon_food', [food])


# ---- the cheer pennant (polish H1): the 촌장 응원 pose holds it up so the cheer has colour above his head

PENNANT_STICK = 0.42        # stick length above the grip (m); 0.05 below it
PENNANT_HOIST = 0.190       # flag height at the stick
PENNANT_LEN = 0.290         # flag length (stick -> point)
PENNANT_NX, PENNANT_NZ = 12, 6


def _pennant_texture():
    """Teal flag, darker hem along the two flying edges, a cream six-arm snowflake near the stick.  No text.
    u = 0 at the stick .. 1 at the point, v = 0 bottom .. 1 top of the hoist (the triangle lies inside)."""
    w, h = 128, 84
    a = np.empty((h, w, 3), np.float32)
    a[:] = PENNANT_TEAL
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    u = (xx + 0.5) / w
    v = 1.0 - (yy + 0.5) / h
    half = 0.5 * (1.0 - u) + 0.02
    edge = np.abs(v - 0.5) > half - 0.075 * (1.0 - 0.6 * u)
    a[edge] = PENNANT_EDGE
    # snowflake: 3 bars through (u0, 0.5) at 0 / 60 / 120 deg + little tips, in flag metres so it stays round
    cx, cy = 0.30 * PENNANT_LEN, 0.5 * PENNANT_HOIST
    px, py = u * PENNANT_LEN, v * PENNANT_HOIST
    r = 0.040
    flake = np.zeros((h, w), bool)
    for k in range(3):
        ang = math.radians(90 + 60 * k)
        dx, dy = math.cos(ang), math.sin(ang)
        t = (px - cx) * dx + (py - cy) * dy
        d = np.abs(-(px - cx) * dy + (py - cy) * dx)
        flake |= (np.abs(t) < r) & (d < 0.0075)
        for sgn in (-1, 1):                         # small Vs near both ends of each arm
            ex, ey = cx + sgn * 0.62 * r * dx, cy + sgn * 0.62 * r * dy
            for side in (-1, 1):
                b = ang + side * math.radians(55) + (0 if sgn > 0 else math.pi)
                bx, by = math.cos(b), math.sin(b)
                tt = (px - ex) * bx + (py - ey) * by
                dd = np.abs(-(px - ex) * by + (py - ey) * bx)
                flake |= (tt > 0) & (tt < 0.016) & (dd < 0.005)
    flake |= (px - cx) ** 2 + (py - cy) ** 2 < 0.010 ** 2
    a[flake] = PENNANT_FLAKE
    a = a / 255.0
    img = bpy.data.images.new('pennant_tex', w, h, alpha=True)
    rgba = np.concatenate([a[::-1], np.ones((h, w, 1), np.float32)], -1)
    img.pixels.foreach_set(rgba.ravel())
    img.pack()
    mt = bpy.data.materials.new('pennant_mat')
    mt.use_nodes = True
    nt = mt.node_tree
    p = nt.nodes.get('Principled BSDF')
    p.inputs['Roughness'].default_value = 0.8
    tx = nt.nodes.new('ShaderNodeTexImage')
    tx.image = img
    tx.interpolation = 'Linear'
    nt.links.new(tx.outputs['Color'], p.inputs['Base Color'])
    return mt


def make_pennant(rig):
    """Cheer pennant: origin = the grip (the fist's centre), stick along +Z, the flag flies along +X from the top
    of the stick (a triangle, PENNANT_HOIST high at the stick, PENNANT_LEN long), its faces in the XZ plane."""
    t = _prop_root(rig, 'pennant')
    stick = g.mesh_obj('pennant_stick', g.bm_lathe([(0.0, -0.050), (0.0095, -0.046), (0.0085, PENNANT_STICK),
                                                    (0.0, PENNANT_STICK + 0.002)], seg=10, smooth_n=8),
                       M('pennant_stick', PENNANT_STICK_C, rough=0.5), t)
    knob = g.mesh_obj('pennant_knob', g.bm_ellipsoid(0.020, 0.020, 0.020, 14, 8),
                      M('pennant_knob', PENNANT_KNOB_C, rough=0.3, metal=0.5), t, loc=(0, 0, PENNANT_STICK + 0.012))
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new('UVMap')
    z_top = PENNANT_STICK - 0.008
    z_bot = z_top - PENNANT_HOIST
    zc = 0.5 * (z_top + z_bot)
    rows = []
    for kx in range(PENNANT_NX + 1):
        u = kx / PENNANT_NX
        half = max(0.006, 0.5 * PENNANT_HOIST * (1.0 - u))
        col = []
        for kz in range(PENNANT_NZ + 1):
            z = zc - half + 2 * half * kz / PENNANT_NZ
            col.append(bm.verts.new((0.006 + u * PENNANT_LEN, 0.0, z)))
        rows.append(col)
    for kx in range(PENNANT_NX):
        for kz in range(PENNANT_NZ):
            f = bm.faces.new((rows[kx][kz], rows[kx + 1][kz], rows[kx + 1][kz + 1], rows[kx][kz + 1]))
            for loop in f.loops:
                v = loop.vert.co
                loop[uv].uv = ((v.x - 0.006) / PENNANT_LEN, (v.z - z_bot) / PENNANT_HOIST)
    flag = g.mesh_obj('pennant_flag', bm, _pennant_texture(), t, smooth=True)
    rig.meta['pennant'] = dict(obj=t, flag=flag, rest=[Vector(v.co) for v in flag.data.vertices], zc=zc)
    rig.toggle('pennant', [stick, knob, flag])


def set_pennant(rig, spec):
    """Per-frame flag shape.  spec: phase (rad) and amp (m) of the travelling ripple (it grows toward the point),
    waves (ripples along the flag), droop (m the point sags), lift (m the point rises: the flag streams while the
    stick swings)."""
    P = rig.meta['pennant']
    amp = spec.get('amp', 0.020)
    ph = spec.get('phase', 0.0)
    waves = spec.get('waves', 1.15)
    droop = spec.get('droop', 0.0) - spec.get('lift', 0.0)
    co = []
    for v in P['rest']:
        u = min(1.0, max(0.0, (v.x - 0.006) / PENNANT_LEN))
        y = amp * (u ** 1.25) * math.sin(TAU_ * waves * u - ph)
        z = v.z - droop * u * u
        x = v.x - abs(y) * 0.25 * u            # a rippling flag gets a touch shorter
        co.extend((x, y, z))
    f = P['flag']
    f.data.vertices.foreach_set('co', co)
    f.data.update()


TAU_ = 2 * PI


def place_prop_axes(rig, name, loc, zdir, xdir):
    """Place a prop at root-local `loc` with its +Z along `zdir` and its +X as close to `xdir` as possible."""
    z = Vector(zdir).normalized()
    x = Vector(xdir)
    x = (x - z * x.dot(z))
    if x.length < 1e-5:
        x = z.orthogonal()
    x.normalize()
    y = z.cross(x)
    m = Matrix((x, y, z)).transposed()
    e = rig.meta['props'][name]
    e.location = Vector(loc)
    e.rotation_mode = 'QUATERNION'
    e.rotation_quaternion = m.to_quaternion()


# ---- rubber-hose sleeves (polish): for the big reaches of wave / cheer (stretch > ~0.08 m) the sleeve capsules are
# lengthened with the bones, so the arm stays one continuous sleeve (opt-in per pose: '_hose')

def _hose_setup(rig):
    H = {}
    for sd in ('R', 'L'):
        for o in rig.j['sh_' + sd].children:
            if o.name.startswith('uarm_'):
                H['uarm_' + sd] = (o, Vector(o.location), Vector(o.scale))
        for o in rig.j['el_' + sd].children:
            if o.name.startswith('farm_'):
                H['farm_' + sd] = (o, Vector(o.location), Vector(o.scale))
            if o.name.startswith('cuff_'):
                H['cuff_' + sd] = (o, Vector(o.location), Vector(o.scale))
    rig.meta['hose'] = H


def _hose(rig, side, stretch):
    H = rig.meta['hose']
    UA, FA = cb.UPPER_ARM, cb.FOREARM - 0.02
    for key, (o, loc, sc) in H.items():
        if not key.endswith('_' + side):
            continue
        o.location = Vector(loc)
        o.scale = Vector(sc)
        if stretch <= 0:
            continue
        if key.startswith('uarm'):
            o.scale = Vector((sc.x, sc.y, sc.z * (UA + stretch / 2) / UA))
        elif key.startswith('farm'):
            o.scale = Vector((sc.x, sc.y, sc.z * (FA + stretch / 2) / FA))
        else:
            o.location = Vector((loc.x, loc.y, loc.z - stretch / 2))


# ---- the newspaper: two pages hinged at the fold (x = 0), each a UV-mapped grid

def _paper_texture(name, front):
    """Cream page with print-like marks, no text.  front=True: masthead band + photo."""
    w, h = 140, 200
    a = np.empty((h, w, 3), np.float32)
    a[:] = PAPER

    def box(x0, y0, x1, y1, col):
        a[int(y0 * h):int(y1 * h), int(x0 * w):int(x1 * w)] = col

    m = 0.07
    if front:
        box(m, 0.04, 1 - m, 0.15, INK_DARK)                   # masthead band
        box(m, 0.17, 1 - m, 0.18, INK_MID)                    # double rule
        box(m, 0.19, 1 - m, 0.195, INK_MID)
        box(m, 0.23, 0.80, 0.27, INK_DARK)                    # headline bars
        box(m, 0.29, 0.62, 0.32, INK_DARK)
        box(m, 0.36, 0.56, 0.62, PHOTO)                       # photo box with a lighter "hill"
        yy, xx = np.mgrid[0:h, 0:w]
        hill = ((xx / w - 0.30) ** 2 * 6 + (yy / h - 0.66) ** 2 * 18 < 0.06) & (yy / h < 0.62) & \
               (yy / h > 0.36) & (xx / w > m) & (xx / w < 0.56)
        a[hill] = (196, 214, 228)
        col_x = [(0.60, 1 - m)]
        y0 = 0.36
        for x0, x1 in col_x:
            for k in range(9):
                yy0 = y0 + k * 0.03
                box(x0, yy0, x1 - (0.08 if k % 4 == 3 else 0), yy0 + 0.012, INK_LIGHT)
        for c in range(3):
            x0 = m + c * (1 - 2 * m) / 3 + 0.01
            x1 = m + (c + 1) * (1 - 2 * m) / 3 - 0.02
            for k in range(8):
                yy0 = 0.66 + k * 0.035
                box(x0, yy0, x1 - (0.07 if k % 3 == 2 else 0), yy0 + 0.013, INK_LIGHT)
    else:
        box(m, 0.04, 1 - m, 0.06, INK_MID)
        box(m, 0.09, 0.85, 0.13, INK_DARK)                    # headline
        for c in range(3):
            x0 = m + c * (1 - 2 * m) / 3 + 0.01
            x1 = m + (c + 1) * (1 - 2 * m) / 3 - 0.02
            for k in range(20):
                yy0 = 0.17 + k * 0.038
                if c == 2 and 0.52 < yy0 < 0.80:
                    continue
                box(x0, yy0, x1 - (0.06 if k % 4 == 3 else 0), yy0 + 0.014, INK_LIGHT)
        box(m + 2 * (1 - 2 * m) / 3 + 0.01, 0.53, 1 - m - 0.01, 0.79, (214, 120, 96))   # warm ad box
        box(m + 2 * (1 - 2 * m) / 3 + 0.04, 0.58, 1 - m - 0.04, 0.62, (250, 236, 214))
        box(m + 2 * (1 - 2 * m) / 3 + 0.04, 0.67, 1 - m - 0.07, 0.70, (250, 236, 214))
    a = a / 255.0
    img = bpy.data.images.new(name, w, h, alpha=True)
    rgba = np.concatenate([a[::-1], np.ones((h, w, 1), np.float32)], -1)   # Blender rows go bottom-up
    img.pixels.foreach_set(rgba.ravel())
    img.pack()
    mt = bpy.data.materials.new(name + '_mat')
    mt.use_nodes = True
    nt = mt.node_tree
    p = nt.nodes.get('Principled BSDF')
    p.inputs['Roughness'].default_value = 0.85
    tx = nt.nodes.new('ShaderNodeTexImage')
    tx.image = img
    tx.interpolation = 'Linear'
    nt.links.new(tx.outputs['Color'], p.inputs['Base Color'])
    return mt


PAPER_NX, PAPER_NZ = 8, 8


def _panel_mesh(name, material, parent, side):
    """Grid page: side=-1 -> x in [-W, 0], side=+1 -> x in [0, W]; z in [-H/2, H/2]; flat (y = 0)."""
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new('UVMap')
    verts = []
    for kz in range(PAPER_NZ + 1):
        row = []
        for kx in range(PAPER_NX + 1):
            u = kx / PAPER_NX
            x = (u * PAPER_W) if side > 0 else (-PAPER_W + u * PAPER_W)
            z = -PAPER_H / 2 + PAPER_H * kz / PAPER_NZ
            row.append(bm.verts.new((x, 0.0, z)))
        verts.append(row)
    for kz in range(PAPER_NZ):
        for kx in range(PAPER_NX):
            f = bm.faces.new((verts[kz][kx], verts[kz][kx + 1], verts[kz + 1][kx + 1], verts[kz + 1][kx]))
            for loop in f.loops:
                v = loop.vert
                xx = v.co.x if side > 0 else v.co.x + PAPER_W
                loop[uv].uv = (xx / PAPER_W, (v.co.z + PAPER_H / 2) / PAPER_H)
    ob = g.mesh_obj(name, bm, material, parent, smooth=True)
    ob['side'] = side
    return ob


def make_paper(rig):
    """Newspaper.  paper_obj origin = the fold centre; the RIGHT page (his right, -X) is rigid, the
    LEFT page (+X) swings on the fold (hinge empty) from folded (180 deg, lying over the right page on the
    camera side) to open (0 deg = flat spread).  Per-frame shape: see set_paper()."""
    t = _prop_root(rig, 'paper')
    front = _paper_texture('paper_front', True)
    back = _paper_texture('paper_back', False)
    right = _panel_mesh('paper_page_r', back, t, -1)
    hinge = g.empty('paper_hinge', t, (0, 0, 0))
    left = _panel_mesh('paper_page_l', front, hinge, +1)
    rig.meta['paper'] = dict(obj=t, hinge=hinge, right=right, left=left,
                             rest={o.name: [Vector(v.co) for v in o.data.vertices] for o in (right, left)})
    rig.toggle('paper', [right, left])


def set_paper(rig, spec):
    """spec: loc (fold centre, root-local), rot (deg, root-local XYZ euler), fold (deg: 0 open .. 180 folded;
    the left page swings toward the camera / away from him), vee (deg each page is turned toward him, the
    open spread is a shallow V), curl (m: top edge bends back toward him), flutter (m: the outer top corner of
    the left page lifts), sag (m: the middle of the spread dips)."""
    P = rig.meta['paper']
    t = P['obj']
    t.location = Vector(spec['loc'])
    t.rotation_mode = 'XYZ'
    t.rotation_euler = Euler([math.radians(a) for a in spec.get('rot', (0, 0, 0))], 'XYZ')
    vee = math.radians(spec.get('vee', 0.0))
    fold = math.radians(spec.get('fold', 0.0))
    curl = spec.get('curl', 0.0)
    flutter = spec.get('flutter', 0.0)
    sag = spec.get('sag', 0.0)
    P['fold'] = max(0.0, spec.get('fold', 0.0))
    # open spread = a shallow V opening toward him: the outer edges come toward him (+Y), the fold stays
    # away.  Folding swings the left page toward the camera side (-Y) and over the right page.
    P['right'].rotation_mode = 'XYZ'
    P['right'].rotation_euler = Euler((0, 0, -vee), 'XYZ')
    P['hinge'].rotation_mode = 'XYZ'
    P['hinge'].rotation_euler = Euler((0, 0, vee - fold), 'XYZ')
    P['hinge'].location = Vector((0, -0.004 * max(0.0, fold) / 180.0, 0))
    for ob in (P['right'], P['left']):
        rest = P['rest'][ob.name]
        side = ob['side']
        co = []
        for v in rest:
            ux = min(1.0, max(0.0, abs(v.x) / PAPER_W))               # 0 at the fold, 1 at the outer edge
            uz = min(1.0, max(0.0, (v.z + PAPER_H / 2) / PAPER_H))    # 0 bottom, 1 top
            y = curl * uz ** 2.2                     # top edge bends back (toward him, +Y)
            y += sag * math.sin(PI * uz) * (1 - ux) * 0.5
            if side > 0:
                y -= flutter * (ux * uz) ** 2.0      # outer top corner of the left page flaps out
            co.extend((v.x, y, v.z))
        ob.data.vertices.foreach_set('co', co)
        ob.data.update()


def paper_grips(rig):
    """World positions of the two mitten grips on the paper: right mitten on the right page's outer edge,
    left mitten on the left page's outer edge (or on the fold spine while the paper is still folded)."""
    P = rig.meta['paper']
    gz = -PAPER_H * 0.08
    r = P['right'].matrix_world @ Vector((-PAPER_W + 0.018, 0.0, gz))
    l_edge = P['left'].matrix_world @ Vector((PAPER_W - 0.018, 0.0, gz))
    spine = P['obj'].matrix_world @ Vector((0.012, -0.01, gz))
    t = max(0.0, min(1.0, 1.0 - P.get('fold', 0.0) / 90.0))
    return r, spine.lerp(l_edge, t)


# --------------------------------------------------------------------------- desk overlay mask

DESK_TOP = 0.27            # desk / table top above the seat point (0.72 m - 0.45 m)
DESK_EDGE = 0.10           # its near edge in front of the seat front
DESK_BAND = 0.31           # only the hands / props zone above the top (keeps the head out of the overlay)


def mask_material(rig):
    """Flat emission: 1 where the surface point (root-local) lies ON the desk zone - in front of the desk's
    near edge (y < -DESK_EDGE) and between the desk top and DESK_BAND above it - else 0.  Rendered as a
    material override for the seated frames; ch2_pack cuts the `_desk` overlay frames with it."""
    if 'mask' in rig.meta:
        return rig.meta['mask']
    m = bpy.data.materials.new('ch2_desk_mask')
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    em = nt.nodes.new('ShaderNodeEmission')
    tc = nt.nodes.new('ShaderNodeTexCoord')
    tc.object = rig.j['root']
    sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    nt.links.new(tc.outputs['Object'], sep.inputs[0])

    def cmp(op, sock, val):
        n = nt.nodes.new('ShaderNodeMath')
        n.operation = op
        n.inputs[1].default_value = val
        nt.links.new(sock, n.inputs[0])
        return n.outputs[0]

    def mul(a, b):
        n = nt.nodes.new('ShaderNodeMath')
        n.operation = 'MULTIPLY'
        nt.links.new(a, n.inputs[0])
        nt.links.new(b, n.inputs[1])
        return n.outputs[0]
    above = cmp('GREATER_THAN', sep.outputs['Z'], DESK_TOP + 0.002)
    below = cmp('LESS_THAN', sep.outputs['Z'], DESK_TOP + DESK_BAND)
    front = cmp('LESS_THAN', sep.outputs['Y'], -DESK_EDGE)
    v = mul(mul(above, below), front)
    nt.links.new(v, em.inputs['Color'])
    em.inputs['Strength'].default_value = 1.0
    nt.links.new(em.outputs[0], out.inputs['Surface'])
    rig.meta['mask'] = m
    return m


# --------------------------------------------------------------------------- per-frame apply

def _root_local(rig, w):
    return rig.j['root'].matrix_world.inverted() @ w


MOUTH_LOCAL = None


def mouth_world(rig):
    global MOUTH_LOCAL
    if MOUTH_LOCAL is None:
        p, n = cb.head_point(0.0, -0.345, out=0.0)
        MOUTH_LOCAL = Vector((p.x, p.y, p.z + cb.HEAD_C))
    return rig.j['head'].matrix_world @ MOUTH_LOCAL


def resolve_loc(rig, loc):
    """(x, y, z) root-local, or ('rel', 'bowl' | 'mouth' | <prop> | <joint>, offset) -> root-local Vector."""
    if isinstance(loc, (tuple, list)) and loc and loc[0] == 'rel':
        _, what, off = loc
        if what == 'mouth':
            base = _root_local(rig, mouth_world(rig))
        elif what in rig.meta['props']:
            base = Vector(rig.meta['props'][what].location)
        else:
            base = _root_local(rig, rig.world(what))
        return base + Vector(off)
    return Vector(loc)


def resolve_rot(rig, loc, rot):
    """XYZ degrees, ('aim', dir) or ('to', joint): the prop's +Z axis points along dir / at the joint."""
    if isinstance(rot, (tuple, list)) and rot and isinstance(rot[0], str):
        if rot[0] == 'aim':
            v = Vector(rot[1])
        else:
            v = _root_local(rig, rig.world(rot[1])) - Vector(loc)
        v.normalize()
        a = math.asin(max(-1.0, min(1.0, -v.y)))
        b = math.atan2(v.x, v.z)
        return (math.degrees(a), math.degrees(b), 0.0)
    return rot


def place_prop(rig, name, loc, rot):
    e = rig.meta['props'][name]
    e.location = Vector(loc)
    e.rotation_mode = 'XYZ'
    e.rotation_euler = Euler([math.radians(a) for a in rot], 'XYZ')


def solve_arm_world(rig, side, target_w, pole_root, stretch=0.0):
    """2-bone IK onto a WORLD point (the chest may lean / twist), elbow pole given root-local.
    `stretch` (m) lengthens upper arm and forearm by stretch/2 each (rubber-hose cheat for reaches
    the short chibi arms cannot make; the sleeve capsules overlap so it never shows)."""
    chest = rig.j['chest']
    bpy.context.view_layer.update()
    cm = chest.matrix_world
    tgt = cm.inverted() @ target_w
    root_rot = rig.j['root'].matrix_world.to_quaternion()
    pole_w = root_rot @ Vector(pole_root)
    pole = cm.to_quaternion().inverted() @ pole_w
    el, hand = rig.j['el_' + side], rig.j['hand_' + side]
    if stretch:
        el.location = rig.rest_loc['el_' + side] * (1 + stretch / 2 / rig.rest_loc['el_' + side].length)
        hand.location = rig.rest_loc['hand_' + side] * (1 + stretch / 2 / rig.rest_loc['hand_' + side].length)
    S = Vector(rig.rest_loc['sh_' + side])
    S = S + (rig.j['sh_' + side].location - rig.rest_loc['sh_' + side])     # shoulder shrug offsets
    L1 = el.location.length
    L2 = hand.location.length
    out = -1.0 if side == 'R' else 1.0
    pole = Vector(pole)
    pole.x = abs(pole.x) * out if abs(pole.x) > 1e-6 else 0.0
    v = tgt - S
    d = max(abs(L1 - L2) + 1e-3, min(L1 + L2 - 1e-3, v.length))
    u = v.normalized()
    cos_a = (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d)
    a = math.acos(max(-1.0, min(1.0, cos_a)))
    cos_e = (L1 * L1 + L2 * L2 - d * d) / (2 * L1 * L2)
    bend = PI - math.acos(max(-1.0, min(1.0, cos_e)))
    e_dir = pole - u * pole.dot(u)
    if e_dir.length < 1e-4:
        e_dir = u.orthogonal()
    e_dir.normalize()
    upper = (u * math.cos(a) + e_dir * math.sin(a)).normalized()
    b = -(e_dir - upper * e_dir.dot(upper))
    z_axis = -upper
    y_axis = -b.normalized()
    x_axis = y_axis.cross(z_axis).normalized()
    m = Matrix((x_axis, y_axis, z_axis)).transposed()
    rig.j['sh_' + side].rotation_quaternion = m.to_quaternion()
    el.rotation_quaternion = g.q_axis((1, 0, 0), -math.degrees(bend))
    bpy.context.view_layer.update()
    got = rig.world('hand_' + side)
    return (got - target_w).length


POLE_R = (-0.8, 0.45, -0.45)
POLE_L = (0.8, 0.45, -0.45)


def apply(rig, pose, d):
    """Pose the rig for one frame.  Returns {'miss': {side: metres}} (IK error, should be ~0)."""
    chest_ik = {sd: pose['ik_' + sd] for sd in ('R', 'L') if 'ik_' + sd in pose}
    rig.apply({k: v for k, v in pose.items() if not k.startswith('ik_')}, yaw_deg=bc.DIR_YAW[d])
    bpy.context.view_layer.update()
    root = rig.j['root'].matrix_world
    targets = {}
    poles = {}
    # chest-local IK targets (char_anim 'ik_R' convention) -> world, solved below with the stretch cheat
    cm = rig.j['chest'].matrix_world
    rq_inv = root.to_quaternion().inverted()
    for sd, v in chest_ik.items():
        targets[sd] = cm @ Vector(v[:3])
        if len(v) >= 6:
            poles[sd] = tuple(rq_inv @ (cm.to_quaternion() @ Vector(v[3:6])))
    # 1) props placed by the pose (business point + orientation, root-local)
    for name, (loc, rot) in pose.get('_props', {}).items():
        loc = resolve_loc(rig, loc)
        place_prop(rig, name, loc, resolve_rot(rig, loc, rot))
        bpy.context.view_layer.update()
    if '_paper' in pose:
        set_paper(rig, pose['_paper'])
    bpy.context.view_layer.update()
    # 2) hands onto the prop grips (or explicit root-local targets 'wik_R' / 'wik_L')
    for name in pose.get('_props', {}):
        if name in GRIPS:
            side, grip = GRIPS[name]
            targets[side] = rig.meta['props'][name].matrix_world @ Vector(grip)
    if '_paper' in pose:
        r, l = paper_grips(rig)
        targets['R'], targets['L'] = r, l
    for side in ('R', 'L'):
        w = pose.get('wik_' + side)
        if w is not None:
            targets[side] = root @ Vector(w[:3])
    miss = {}
    for side in ('R', 'L'):
        _hose(rig, side, pose.get('_stretch_' + side, 0.0) if pose.get('_hose') else 0.0)
    for side, tw in targets.items():
        pole = poles.get(side) or pose.get('_pole_' + side, POLE_R if side == 'R' else POLE_L)
        miss[side] = solve_arm_world(rig, side, tw, pole, stretch=pose.get('_stretch_' + side, 0.0))
    bpy.context.view_layer.update()
    # 3) props held in a fist (polish: the cheer pennant): placed AT the solved mitten, axes root-local
    for name, (side, zdir, xdir) in pose.get('_held', {}).items():
        loc = _root_local(rig, rig.world('hand_' + side))
        place_prop_axes(rig, name, loc, zdir, xdir)
    if '_pennant' in pose:
        set_pennant(rig, pose['_pennant'])
    rig.update_strings()
    bpy.context.view_layer.update()
    return {'miss': miss}
