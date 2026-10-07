"""
vil3_dress.py - outfits of the batch-3 craft workers + the station work tools used by the
'operate' anim (기획서_v3_분업).  Not run directly (imported by vil3_build.py).

Same conventions as vil_dress / vil2_dress (both reused, never changed): every
dress_<key>(rig, spec) works on the STANDARD body from vil_body.build_body before
vil_body.apply_proportions().  Spine-local coords: front = -Y, character's right = -X.

New looks
  npc_sawyer   short sandy hair, goggles pushed up on the forehead, sage shirt with rolled
               sleeves, sawdust-speckled canvas apron with a pencil in the pocket
  npc_smoker   knotted polka-dot bandana, stubble, red plaid shirt, leather apron,
               big padded oven mitts
  npc_cannery  red flat cap, cream shirt under blue denim overalls (bib, straps, brass
               buttons), shiny yellow rubber gloves with flared cuffs

Work tools (add_work_tools(rig, role)) - every tool is an unparented empty with child
meshes, registered as a Rig toggle (so it is hidden in every other anim) and placed each
frame by a Rig.strings callback from the pose's '_work' state (see vil3_anim):
    grill       pan, fish_op                  bakery     rpin, board, dough
    smelter     hammer, tongs, hotbar         sawmill    log
    smokehouse  ham, fan                      cannery    press, lever, ram, can_open, can_sealed
pin_hands() runs FIRST in Rig.strings: it re-solves the arm IK so the mitten centres land
exactly on the absolute '_work' R/L targets (handles that rest on the station), then the
driver places the tools and the 'fx' / 'fx2' marker empties (impactPoint / beats).
Tool-local frame: x = character's left, -y = forward, z = up (rot (elev, roll, yawR) =
facing frame @ Euler('YXZ')).
"""
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

import bpy                                       # noqa: E402
from mathutils import Vector, Matrix, Euler      # noqa: E402

import bl_common as bc                           # noqa: E402
import char_geo as g                             # noqa: E402
import char_build as cb                          # noqa: E402
import vil_face as vf                            # noqa: E402
import vil_dress as vd                           # noqa: E402
import vil2_dress as vd2                         # noqa: E402
import vil3_anim as va3                          # noqa: E402

PI = math.pi
TAU = math.tau
M = cb.M
HEAD_R, HEAD_C = cb.HEAD_R, cb.HEAD_C
ho = vd.ho
face_obj = vd.face_obj


def RFZ(v):
    """(r, f, z) facing-frame metres -> Blender local (x = left, y = back, z = up)."""
    return Vector((-v[0], -v[1], v[2]))


# --------------------------------------------------------------------------- dressing helpers

def torso_r(prof, z):
    return vd.interp_profile(g.catmull(prof, 60), z)


def overlay(prof, z0, z1, extra=0.012, n=6, flare=0.0):
    """Profile that hugs the torso lathe between z0..z1 (+extra), for aprons / overalls."""
    out = []
    for k in range(n):
        z = z0 + (z1 - z0) * k / (n - 1)
        out.append((torso_r(prof, z) + extra + flare * (1 - k / (n - 1)), z))
    return out


def on_face(rig, name, bm, mat, u, v, out):
    """Mesh built along +Z, stood on the head-front surface at face coords (u, v)."""
    p, n = vf.surf(u, v, out)
    q = n.to_track_quat('Z', 'Y')
    return g.mesh_obj(name, bm, mat, rig.j['head'], loc=(p.x, p.y, p.z + HEAD_C), rot=q)


def hand_parts(rig):
    out = []
    for s in ('R', 'L'):
        for ob in rig.j['hand_' + s].children:
            if ob.type == 'MESH' and (ob.name.startswith('mitt_') or ob.name.startswith('thumb_')):
                out.append((s, ob))
    return out


def apron(rig, prof, mat, hem_z, top=0.30, keep=56, pocket_mat=None, strap_mat=None):
    hem = torso_r(prof, hem_z)
    pts = [(hem + 0.030, hem_z - 0.030)] + overlay(prof, hem_z + 0.02, top, extra=0.016, n=6)
    g.mesh_obj('apron', vd.sector_lathe(pts, keep_deg=keep, sy=0.88), mat, rig.j['spine'])
    if pocket_mat is not None:
        g.mesh_obj('apron_pocket', vd.sector_lathe(overlay(prof, -0.04, 0.05, extra=0.024, n=3), keep_deg=24,
                                                   sy=0.88), pocket_mat, rig.j['spine'])
    sm = strap_mat or mat
    for s in (-1, 1):
        g.mesh_obj('apron_strap', g.bm_tube_path([(s * 0.095, -0.155, top + 0.04), (s * 0.115, -0.07, 0.43),
                                                  (s * 0.10, 0.08, 0.43)], 0.013, segr=6), sm, rig.j['spine'])


# --------------------------------------------------------------------------- characters

def dress_sawyer(rig, spec):
    """제재공 산들: sandy hair, goggles up on the forehead, canvas apron dusted with sawdust."""
    hair = spec['hair']
    cb.hair_shell(rig, hair, fringe=0.30, wave=0.12, waves=13.0, sweep=0.16, back_low=-0.46, top_puff=0.05)
    for az, el in ((-0.45, 0.90), (-0.12, 0.98), (0.22, 0.97), (0.52, 0.88), (PI, 0.70), (2.4, 0.82), (-2.4, 0.82),
                   (1.5, 0.95), (-1.5, 0.95), (0.95, 0.78), (-0.95, 0.78)):
        cb.hair_tuft(rig, hair, az, el, size=(0.050, 0.040, 0.075), tilt=(-28 if abs(az) < 1.2 else 40, 0, 0),
                     name='spike')
    for az, sz in ((-0.46, 0.85), (-0.17, 1.0), (0.12, 1.05), (0.40, 0.9)):
        cb.hair_tuft(rig, hair, az, 0.30, size=(0.050 * sz, 0.035, 0.085 * sz), tilt=(-82, 10 * az, 0), name='bang')
    matte = M('hair_sandy', hair, rough=0.78)            # light hair: no glossy 'helmet' highlight
    for ob in rig.j['head'].children:
        if ob.type == 'MESH' and ob.data.materials and ob.data.materials[0].name.startswith('hair'):
            ob.data.materials[0] = matte
    # goggles pushed up: leather strap round the head + two dark-rimmed blue lenses on the forehead
    strap = M('goggle_strap', '#4A3024', rough=0.6)
    cb.tilted_ring(rig, 'goggle_strap', strap, HEAD_R[0] * 1.075, 0.015, 0.60, 0.20, sy=0.985, rz=1.3)
    rim = M('goggle_rim', '#3A3A44', rough=0.35, metal=0.5)
    glass = M('goggle_glass', '#8FD3E8', rough=0.10, emission='#BFEFFF', emission_strength=0.35)
    glint = M('glint', '#FFFFFF', rough=0.2, emission='#FFFFFF', emission_strength=1.2)
    for s in (-1, 1):
        u, v = s * 0.100, 0.158
        on_face(rig, 'goggle_cup', g.bm_cyl(0.060, 0.056, 0.048, seg=22), rim, u, v, 0.032)
        on_face(rig, 'goggle_lens', g.bm_ellipsoid(0.047, 0.047, 0.010, 20, 8), glass, u, v, 0.078)
        on_face(rig, 'goggle_rim', g.bm_ring(0.050, 0.010, seg=26, segr=8), M('goggle_brass', '#C9A045', rough=0.35,
                                                                             metal=0.6), u, v, 0.082)
        on_face(rig, 'goggle_glint', g.bm_ellipsoid(0.014, 0.008, 0.004, 8, 4), glint, u - 0.018, v + 0.016, 0.090)
    on_face(rig, 'goggle_bridge', g.bm_box(0.046, 0.018, 0.020, bevel=0.006), rim, 0.0, 0.158, 0.056)
    # sawdust-speckled canvas apron, pocket + pencil
    prof = spec['torso_profile_raw']
    canvas = vd2.mat_splatter('canvas_sawdust', '#CDB48A', ['#F6E4B2', '#EBCB86', '#FFF4D2'], scale=30.0,
                              size=0.17, rough=0.92)
    apron(rig, prof, canvas, spec.get('hem_z', -0.08), top=0.30, keep=55,
          pocket_mat=M('canvas_d', '#B39868', rough=0.9), strap_mat=M('canvas_strap', '#B39868', rough=0.9))
    g.mesh_obj('pencil', g.bm_cyl(0.011, 0.011, 0.11, seg=8), M('pencil', '#F2C230', rough=0.5), rig.j['spine'],
               loc=(-0.05, -0.215, 0.02), rot=(-8, 12, 0))
    g.mesh_obj('pencil_tip', g.bm_lathe([(0.011, 0.0), (0.0, 0.03)], seg=8), M('pencil_wood', '#E8C48A', rough=0.6),
               rig.j['spine'], loc=(-0.05 - 0.011 * math.sin(math.radians(12)), -0.215 + 0.0, 0.13),
               rot=(-8, 12, 0))
    cb.belt(rig, '#6B4A2E', z=0.12, r=torso_r(prof, 0.12) + 0.006, buckle=None, width=0.35)


def dress_smoker(rig, spec):
    """훈제사 연기: knotted dotted bandana, stubble, plaid shirt, leather apron, big oven mitts."""
    hair = spec['hair']
    cb.hair_shell(rig, hair, fringe=0.36, wave=0.05, waves=10.0, sweep=0.05, back_low=-0.48, top_puff=0.03)
    dots = vd2.mat_splatter('bandana_dots', '#2F5FA0', ['#F4F1EA', '#FBF8F0'], scale=15.0, size=0.19, rough=0.85)
    cb.cap_shell(rig, dots, lambda x, y: 0.34 - 0.40 * y, base=1.145, puff=0.04, name='bandana', soft=0.03)
    dark = M('bandana_hem', '#244C84', rough=0.85)
    cb.tilted_ring(rig, 'bandana_hem', dark, HEAD_R[0] * 1.075, 0.017, 0.72, -0.08, sy=0.97, rz=1.0)
    vd2.knot_tails(rig, dark, (0.0, 0.322, -0.030), s=1.15)
    # stubble: a soft grey shadow round the jaw (under the mouth decals) + a few darker flecks
    mv = spec.get('mouth_v', -0.100)
    jaw = []
    for k in range(13):
        a = PI + PI * k / 12                      # lower half-ellipse
        jaw.append((0.205 * math.cos(a), -0.055 + 0.160 * math.sin(a)))
    top = [(0.150, mv + 0.012), (0.075, mv + 0.026), (0.0, mv + 0.030), (-0.075, mv + 0.026), (-0.150, mv + 0.012)]
    stub = M('stubble', '#B69E92', rough=0.95)
    face_obj(rig, 'stubble', vf.bm_blob(jaw + top, thick=0.003, out=0.0005), stub)
    fl = M('stubble_d', '#9A8278', rough=0.95)
    for k, (u, v) in enumerate(((-0.11, -0.16), (0.10, -0.165), (-0.05, -0.19), (0.04, -0.195), (0.16, -0.12),
                                (-0.16, -0.12), (0.0, -0.175))):
        face_obj(rig, 'stubble_f', vf.bm_blob(vf.ellipse(u, v, 0.010, 0.008, 10), thick=0.003, out=0.0015), fl)
    # leather apron + belt
    prof = spec['torso_profile_raw']
    leather = M('leather', '#6B4428', rough=0.55)
    apron(rig, prof, leather, spec.get('hem_z', -0.08), top=0.31, keep=56,
          pocket_mat=M('leather_d', '#4E3020', rough=0.6), strap_mat=M('leather_d', '#4E3020', rough=0.6))
    cb.belt(rig, '#3B2A20', z=0.10, r=torso_r(prof, 0.10) + 0.012, buckle='#B9C2CE', width=0.45)
    # big padded oven mitts: bigger mitten + thumb, quilted cuff
    mitt = M('oven_mitt', '#EFE4CC', rough=0.85)
    cuff = M('oven_cuff', '#C8463D', rough=0.9)
    for s, ob in hand_parts(rig):
        ob.data.materials.clear()
        ob.data.materials.append(mitt)
        ob.scale = (1.42, 1.42, 1.40) if ob.name.startswith('mitt_') else (1.35, 1.35, 1.35)
        if ob.name.startswith('mitt_'):
            ob.location = (ob.location[0], ob.location[1], ob.location[2] - 0.012)
    for s in ('R', 'L'):
        g.mesh_obj('mitt_cuff', g.bm_ring(0.064, 0.026, seg=28, segr=10, tufts=6, bump=0.2, seed=1.5), cuff,
                   rig.j['hand_' + s], loc=(0, 0, 0.050))


def dress_cannery(rig, spec):
    """통조림 기술자 통통: red flat cap, blue denim overalls over a cream shirt, yellow rubber gloves."""
    hair = spec['hair']
    cb.hair_shell(rig, hair, fringe=0.40, wave=0.05, waves=9.0, sweep=0.0, back_low=-0.45)
    cap = M('cap', '#D0503C', rough=0.9)
    cb.cap_shell(rig, cap, lambda x, y: 0.28 - 0.16 * y, base=1.12, puff=0.10, name='cap_base', soft=0.03)
    crown = g.bm_ellipsoid(0.33, 0.335, 0.12, 32, 14)
    ho(rig, 'cap_crown', vd.fuzz(crown, 0.003, 30.0), cap, loc=(0, -0.035, 0.205), rot=(-10, 0, 0))
    ho(rig, 'cap_button', g.bm_ellipsoid(0.03, 0.03, 0.02, 10, 6), cap, loc=(0, -0.05, 0.325))
    brim = g.bm_lathe([(0.0, 0.0), (0.16, 0.0), (0.17, -0.008), (0.0, -0.012)], seg=32, sx=1.0, sy=0.6)
    ho(rig, 'cap_brim', brim, M('cap_brim', '#A83E2E', rough=0.9), loc=(0, -0.26, 0.135), rot=(-14, 0, 0))
    # overalls: denim band round the waist + bib + straps + brass buttons + bib pocket
    prof = spec['torso_profile_raw']
    denim = M('denim', '#3D6FB8', rough=0.85)
    denim_d = M('denim_d', '#2E5A9A', rough=0.85)
    hz = spec.get('hem_z', -0.08)
    hem = torso_r(prof, hz)
    band = [(hem + 0.014, hz - 0.012)] + overlay(prof, hz + 0.02, 0.12, extra=0.012, n=5)
    g.mesh_obj('overall_low', g.bm_lathe(band, seg=44, sy=spec.get('torso_sy', 0.84), cap_top=False,
                                         cap_bottom=False), denim, rig.j['spine'])
    g.mesh_obj('overall_bib', vd.sector_lathe(overlay(prof, 0.10, 0.30, extra=0.014, n=5), keep_deg=40, sy=0.86),
               denim, rig.j['spine'])
    g.mesh_obj('overall_pocket', vd.sector_lathe(overlay(prof, 0.15, 0.23, extra=0.020, n=3), keep_deg=20,
                                                 sy=0.86), denim_d, rig.j['spine'])
    brass = M('brass', '#E8B33A', rough=0.3, metal=0.7)
    for s in (-1, 1):
        g.mesh_obj('overall_strap', g.bm_tube_path([(s * 0.110, -0.160, 0.29), (s * 0.125, -0.08, 0.42),
                                                    (s * 0.110, 0.06, 0.43), (s * 0.10, 0.17, 0.22)], 0.016,
                                                   segr=6, side_ref=(0, 1, 0), flat=1.6), denim, rig.j['spine'])
        bx, by, bz = vd2.torso_pt(s * 22, 0.285, out=0.020, prof=prof)
        g.mesh_obj('overall_button', g.bm_ellipsoid(0.020, 0.012, 0.020, 10, 6), brass, rig.j['spine'],
                   loc=(bx, by, bz))
    # shiny yellow rubber gloves with flared cuffs
    rub = M('rubber_glove', '#F5C531', rough=0.28)
    for s, ob in hand_parts(rig):
        ob.data.materials.clear()
        ob.data.materials.append(rub)
    for s in ('R', 'L'):
        g.mesh_obj('glove_cuff', g.bm_lathe([(0.050, -0.03), (0.062, 0.03), (0.074, 0.065), (0.068, 0.07),
                                             (0.054, 0.03), (0.044, -0.03)], seg=24, cap_top=False,
                                            cap_bottom=False), rub, rig.j['hand_' + s], loc=(0, 0, 0.040))


DRESS = {'npc_sawyer': dress_sawyer, 'npc_smoker': dress_smoker, 'npc_cannery': dress_cannery}


# --------------------------------------------------------------------------- work tools

def _tool(rig, name, kids_fn):
    """Unparented empty + child meshes (built by kids_fn(parent) -> [objects]); toggle `name`."""
    e = g.empty('op_' + name)
    e.rotation_mode = 'QUATERNION'
    objs = kids_fn(e)
    rig.toggle(name, objs)
    rig.meta.setdefault('op_props', {})[name] = e
    return e


def _x_cyl(r1, r2, length, seg=16):
    """Cylinder along X, centred."""
    bm = g.bm_cyl(r1, r2, length, seg=seg, centered=True)
    return g.bm_transform(bm, Matrix.Rotation(PI / 2, 4, 'Y'))


def _y_cyl(r1, r2, length, seg=16):
    bm = g.bm_cyl(r1, r2, length, seg=seg, centered=True)
    return g.bm_transform(bm, Matrix.Rotation(PI / 2, 4, 'X'))


def make_pan(e):
    iron = M('pan_iron', '#34353E', rough=0.45, metal=0.5)
    rim = M('pan_rim', '#6A6D78', rough=0.35, metal=0.6)
    wood = M('pan_handle', '#6B4428', rough=0.55)
    c = va3.PAN_C
    objs = [g.mesh_obj('pan_handle', g.bm_tube_path([(0, 0.045, -0.004), (0, -0.06, 0.004), (0, -0.165, 0.012)],
                                                     0.019, segr=10), wood, e),
            g.mesh_obj('pan_neck', g.bm_tube_path([(0, -0.140, 0.010), (0, -0.182, 0.020)], 0.012,
                                                   segr=8), rim, e)]
    bowl = g.bm_lathe([(0.0, -0.018), (0.105, -0.018), (0.128, 0.004), (0.136, 0.030), (0.124, 0.030),
                       (0.112, 0.000), (0.0, -0.004)], seg=36)
    objs.append(g.mesh_obj('pan_bowl', bowl, iron, e, loc=(0, -c, 0)))
    objs.append(g.mesh_obj('pan_lip', g.bm_ring(0.130, 0.008, seg=40, segr=6), rim, e, loc=(0, -c, 0.030)))
    return objs


def make_fish(e):
    gold = M('op_fish', '#E39A45', rough=0.45)
    dark = M('op_fish_d', '#B8632A', rough=0.5)
    objs = [g.mesh_obj('op_fish_body', vd.fuzz(g.bm_ellipsoid(0.052, 0.128, 0.040, 20, 10), 0.002, 40.0), gold, e),
            g.mesh_obj('op_fish_tail', g.bm_ellipsoid(0.010, 0.040, 0.044, 10, 8), dark, e, loc=(0, 0.140, 0.004),
                       rot=(0, 0, 0))]
    for k in range(3):
        objs.append(g.mesh_obj('op_fish_grill', g.bm_box(0.075, 0.010, 0.006, bevel=0.002),
                               M('grill_mark', '#7A3E1E', rough=0.6), e, loc=(0, -0.045 + 0.040 * k, 0.038),
                               rot=(0, 0, 20)))
    for s in (-1, 1):
        objs.append(g.mesh_obj('op_fish_eye', g.bm_ellipsoid(0.008, 0.012, 0.012, 8, 6),
                               M('fish_eye', '#2A2026', rough=0.3), e, loc=(s * 0.040, -0.090, 0.010)))
    return objs


def make_rolling_pin(e):
    wood = M('rpin_wood', '#E8BE82', rough=0.5)
    dark = M('rpin_handle', '#B07C48', rough=0.5)
    objs = [g.mesh_obj('rpin_body', _x_cyl(va3.PIN_R, va3.PIN_R, 0.28, seg=20), wood, e)]
    for s in (-1, 1):
        objs.append(g.mesh_obj('rpin_handle', _x_cyl(0.016, 0.016, 0.085, seg=12), dark, e, loc=(s * 0.180, 0, 0)))
        objs.append(g.mesh_obj('rpin_knob', g.bm_ellipsoid(0.014, 0.021, 0.021, 10, 8), dark, e,
                               loc=(s * 0.226, 0, 0)))
    return objs


def make_board(e):
    wood = M('board_wood', '#D9A867', rough=0.6)
    flour = M('flour', '#FBF8F2', rough=0.9, emission='#FFFFFF', emission_strength=0.08)
    objs = [g.mesh_obj('board', g.bm_box(0.42, 0.30, 0.030, bevel=0.008), wood, e, loc=(0, 0, -0.015))]
    for k, (x, y, rx, ry) in enumerate(((0.15, -0.09, 0.050, 0.030), (-0.16, 0.08, 0.045, 0.035),
                                        (0.12, 0.10, 0.030, 0.022), (-0.10, -0.11, 0.035, 0.020))):
        objs.append(g.mesh_obj('flour', g.bm_ellipsoid(rx, ry, 0.004, 14, 6), flour, e, loc=(x, y, 0.001)))
    return objs


def make_dough(e):
    dough = M('dough', '#F6E3BE', rough=0.7, emission='#FFF4DC', emission_strength=0.05)
    return [g.mesh_obj('dough', vd.fuzz(g.bm_ellipsoid(0.120, 0.100, 0.025, 24, 10), 0.002, 30.0), dough, e,
                       loc=(0, 0, 0.025))]


def make_hammer(e):
    wood = M('hammer_wood', '#C98F55', rough=0.55)
    iron = M('hammer_iron', '#A9B2BF', rough=0.30, metal=0.6)
    face = M('hammer_face', '#E6ECF2', rough=0.20, metal=0.7)
    L = va3.HAMMER_L
    objs = [g.mesh_obj('hammer_handle', g.bm_tube_path([(0, 0.050, 0), (0, -L + 0.02, 0)],
                                                        lambda t: 0.020 - 0.003 * t, segr=10), wood, e),
            g.mesh_obj('hammer_head', g.bm_box(0.074, 0.084, 0.116, bevel=0.012), iron, e, loc=(0, -L, 0)),
            g.mesh_obj('hammer_face', g.bm_box(0.078, 0.088, 0.012, bevel=0.004), face, e, loc=(0, -L, -0.054)),
            g.mesh_obj('hammer_face2', g.bm_box(0.078, 0.088, 0.012, bevel=0.004), face, e, loc=(0, -L, 0.054)),
            g.mesh_obj('hammer_wedge', g.bm_box(0.020, 0.030, 0.020, bevel=0.004), M('hammer_wedge', '#8A5A33',
                                                                                      rough=0.6), e,
                       loc=(0, -L, 0.0))]
    return objs


def make_tongs(e):
    iron = M('tongs_iron', '#3B3F48', rough=0.4, metal=0.6)
    objs = []
    for s in (-1, 1):
        pts = [(s * 0.010, 0.060, 0.0), (s * 0.012, -0.090, 0.0), (s * 0.006, -0.135, 0.0),
               (s * 0.022, -0.175, 0.0), (s * 0.026, -0.205, 0.0)]
        objs.append(g.mesh_obj('tongs_arm', g.bm_tube_path(vd.catmull3(pts, 12), 0.0085, segr=6), iron, e))
    objs.append(g.mesh_obj('tongs_rivet', g.bm_ellipsoid(0.016, 0.016, 0.012, 10, 6), iron, e,
                           loc=(0, -0.135, 0.0)))
    return objs


def make_hotbar(e):
    hot = M('hotbar', '#FFB040', rough=0.4, emission='#FF6A1A', emission_strength=5.0)
    core = M('hotbar_core', '#FFE7A0', rough=0.4, emission='#FFD070', emission_strength=6.0)
    return [g.mesh_obj('hotbar', g.bm_box(0.050, 0.150, 0.040, bevel=0.010), hot, e),
            g.mesh_obj('hotbar_core', g.bm_box(0.034, 0.090, 0.042, bevel=0.008), core, e, loc=(0, -0.01, 0.002))]


def make_log(e):
    bark = M('log_bark', '#7A5232', rough=0.85)
    wood = M('log_end', '#E8C48A', rough=0.7)
    ring = M('log_ring', '#C2924F', rough=0.7)
    Ln, R = va3.LOG_LEN, va3.LOG_R
    objs = [g.mesh_obj('log', vd.fuzz(_y_cyl(R, R * 0.96, Ln - 0.012, seg=22), 0.004, 35.0), bark, e)]
    for s in (-1, 1):
        y = s * (Ln / 2 - 0.004)
        objs.append(g.mesh_obj('log_end', _y_cyl(R * 0.90, R * 0.90, 0.010, seg=22), wood, e, loc=(0, y, 0)))
        objs.append(g.mesh_obj('log_ring', g.bm_transform(g.bm_ring(R * 0.52, 0.006, seg=24, segr=6),
                                                          Matrix.Rotation(PI / 2, 4, 'X')), ring, e,
                               loc=(0, y + s * 0.006, 0)))
        objs.append(g.mesh_obj('log_pith', g.bm_ellipsoid(0.014, 0.004, 0.014, 8, 4), ring, e,
                               loc=(0, y + s * 0.007, 0)))
    for k in range(3):
        objs.append(g.mesh_obj('log_knot', g.bm_ellipsoid(0.020, 0.020, 0.010, 8, 4), M('log_knot', '#5A3A22',
                                                                                         rough=0.8), e,
                               loc=(0.0, -0.12 + 0.12 * k, R * 0.97), rot=(0, 0, 30 * k)))
    return objs


def make_ham(e):
    hook = M('hook', '#9AA2AE', rough=0.3, metal=0.7)
    meat = M('ham', '#A8452E', rough=0.6)
    crust = M('ham_d', '#7E2E22', rough=0.6)
    bone = M('bone', '#F2E6D0', rough=0.5)
    twine = M('twine', '#E8DCC0', rough=0.9)
    pts = [(0, 0.0, 0.018), (0, -0.022, 0.010), (0, -0.022, -0.012), (0, 0.0, -0.030), (0, 0.020, -0.046),
           (0, 0.012, -0.066), (0, -0.004, -0.072)]
    objs = [g.mesh_obj('ham_hook', g.bm_tube_path(vd.catmull3(pts, 14), 0.0055, segr=6), hook, e),
            g.mesh_obj('ham_bone', g.bm_capsule(0.015, 0.035, r_end=0.012, seg=10, rings=4), bone, e,
                       loc=(0, 0, -0.062)),
            g.mesh_obj('ham', vd.fuzz(g.bm_lathe([(0.0, -0.250), (0.050, -0.243), (0.078, -0.205), (0.084, -0.160),
                                                   (0.066, -0.115), (0.036, -0.092), (0.0, -0.088)], seg=22,
                                                  smooth_n=12, sy=0.86), 0.003, 30.0), meat, e),
            g.mesh_obj('ham_crust', g.bm_ellipsoid(0.060, 0.050, 0.030, 14, 8), crust, e, loc=(0, 0, -0.238))]
    for z in (-0.130, -0.190):
        objs.append(g.mesh_obj('ham_twine', g.bm_ring(0.082 if z > -0.16 else 0.084, 0.0045, seg=28, segr=5,
                                                      sy=0.86), twine, e, loc=(0, 0, z)))
    return objs


def make_fan(e):
    bamboo = M('fan_handle', '#D9B56A', rough=0.6)
    paper = M('fan_paper', '#F4ECD8', rough=0.85, emission='#FFF8EA', emission_strength=0.06)
    red = M('fan_red', '#D8463A', rough=0.7)
    objs = [g.mesh_obj('fan_handle', g.bm_tube_path([(0, 0.045, 0), (0, -0.095, 0)], 0.011, segr=8), bamboo, e),
            g.mesh_obj('fan_paper', g.bm_ellipsoid(0.112, 0.105, 0.007, 28, 6), paper, e, loc=(0, -0.200, 0)),
            g.mesh_obj('fan_rim', g.bm_ring(0.110, 0.008, seg=40, segr=6, sy=0.94), red, e, loc=(0, -0.200, 0))]
    for zz in (-1, 1):
        objs.append(g.mesh_obj('fan_sun', g.bm_ellipsoid(0.045, 0.045, 0.003, 16, 4), red, e,
                               loc=(0.012, -0.205, zz * 0.0075)))
    return objs


def make_press(e):
    """Bench can press in root-local (r, f, z) coordinates (prop placed at the anchor)."""
    body = M('press_iron', '#3E6E6A', rough=0.45, metal=0.35)
    dark = M('press_iron_d', '#2C4E4C', rough=0.5, metal=0.35)
    brass = M('press_brass', '#D9A520', rough=0.35, metal=0.6)
    cf = va3.CAN_AT[1]
    pr, pf, pz = va3.PRESS_PIVOT
    col_f = pf + 0.075
    objs = [g.mesh_obj('press_plate', g.bm_box(0.27, 0.27, 0.040, bevel=0.010), body, e,
                       loc=RFZ((0, cf + 0.03, va3.CAN_AT[2] - 0.020))),
            g.mesh_obj('press_mat', g.bm_box(0.13, 0.13, 0.006, bevel=0.003), dark, e,
                       loc=RFZ((0, cf, va3.CAN_AT[2] + 0.001))),
            g.mesh_obj('press_column', g.bm_box(0.060, 0.060, pz - va3.CAN_AT[2] + 0.04, bevel=0.010), body, e,
                       loc=RFZ((0, col_f, (va3.CAN_AT[2] + pz + 0.04) / 2))),
            g.mesh_obj('press_arm', g.bm_box(0.050, col_f - pf + 0.04, 0.050, bevel=0.010), body, e,
                       loc=RFZ((0, (col_f + pf) / 2, pz))),
            g.mesh_obj('press_guide', g.bm_box(0.040, col_f - cf + 0.03, 0.030, bevel=0.008), dark, e,
                       loc=RFZ((0, (col_f + cf) / 2, va3.RAM_TOP + 0.030))),
            g.mesh_obj('press_guide_ring', g.bm_ring(0.024, 0.010, seg=20, segr=6), dark, e,
                       loc=RFZ((0, cf, va3.RAM_TOP + 0.030))),
            g.mesh_obj('press_pivot', _x_cyl(0.026, 0.026, 0.085), brass, e, loc=RFZ((0, pf, pz)))]
    return objs


def make_lever(e):
    steel = M('lever_steel', '#9AA2AE', rough=0.3, metal=0.7)
    grip = M('lever_grip', '#C8463D', rough=0.6)
    Lv = va3.LEVER_L
    objs = [g.mesh_obj('lever_arm', g.bm_tube_path([(0, 0.02, 0), (0, -Lv, 0)], 0.017, segr=10), steel, e),
            g.mesh_obj('lever_tbar', _x_cyl(0.015, 0.015, 2 * va3.TBAR + 0.05), steel, e, loc=(0, -Lv, 0))]
    for s in (-1, 1):
        objs.append(g.mesh_obj('lever_grip', _x_cyl(0.022, 0.022, 0.075), grip, e,
                               loc=(s * (va3.TBAR - 0.005), -Lv, 0)))
    return objs


def make_ram(e):
    steel = M('ram_steel', '#C9D0DA', rough=0.25, metal=0.7)
    rod = M('lever_steel', '#9AA2AE', rough=0.3, metal=0.7)
    return [g.mesh_obj('ram_head', g.bm_cyl(0.052, 0.050, 0.026, seg=20), steel, e),
            g.mesh_obj('ram_rod', g.bm_cyl(0.015, 0.015, 0.15, seg=10), rod, e, loc=(0, 0, 0.024))]


def _can(e, sealed):
    tin = M('can_tin', '#D7DFE8', rough=0.28, metal=0.7)
    label = M('can_label', '#D8463A', rough=0.6)
    label2 = M('can_label2', '#F2C230', rough=0.6)
    H = va3.CAN_H
    objs = [g.mesh_obj('can_body', g.bm_cyl(0.046, 0.046, H, seg=22), tin, e),
            g.mesh_obj('can_label', g.bm_cyl(0.0475, 0.0475, H * 0.55, seg=22), label, e, loc=(0, 0, H * 0.2)),
            g.mesh_obj('can_label2', g.bm_cyl(0.048, 0.048, H * 0.12, seg=22), label2, e, loc=(0, 0, H * 0.42)),
            g.mesh_obj('can_rim', g.bm_ring(0.044, 0.005, seg=24, segr=6), tin, e, loc=(0, 0, H))]
    if sealed:
        objs.append(g.mesh_obj('can_lid', g.bm_cyl(0.043, 0.043, 0.004, seg=22), M('can_lid', '#EEF2F6', rough=0.2,
                                                                                    metal=0.7), e,
                               loc=(0, 0, H - 0.002)))
        objs.append(g.mesh_obj('can_lid_ring', g.bm_ring(0.026, 0.0035, seg=20, segr=5), tin, e,
                               loc=(0, 0, H + 0.002)))
    else:
        objs.append(g.mesh_obj('can_fish', vd.fuzz(g.bm_ellipsoid(0.040, 0.040, 0.010, 16, 6), 0.002, 50.0),
                               M('can_fish', '#F2A15A', rough=0.5), e, loc=(0, 0, H - 0.008)))
    return objs


TOOLS = {
    'grill': {'pan': make_pan, 'fish_op': make_fish},
    'bakery': {'rpin': make_rolling_pin, 'board': make_board, 'dough': make_dough},
    'smelter': {'hammer': make_hammer, 'tongs': make_tongs, 'hotbar': make_hotbar},
    'sawmill': {'log': make_log},
    'smokehouse': {'ham': make_ham, 'fan': make_fan},
    'cannery': {'press': make_press, 'lever': make_lever, 'ram': make_ram,
                'can_open': lambda e: _can(e, False), 'can_sealed': lambda e: _can(e, True)},
}


# --------------------------------------------------------------------------- per-frame placement

def pin_hands(r):
    """Exact IK: mitten centres onto the absolute '_work' targets (facing frame)."""
    w = r.state.get('_work')
    if not w or not (w.get('R') or w.get('L')):
        return
    rootm = r.j['root'].matrix_world
    facing = rootm.to_3x3().normalized()
    ci = r.j['chest'].matrix_world.inverted()
    want = {}
    for s in ('R', 'L'):
        t = w.get(s)
        if t is None:
            continue
        wp = rootm.translation + facing @ RFZ(t)
        want[s] = wp
        r.solve_arm(s, tuple(ci @ wp), w.get('pole' + s))
    bpy.context.view_layer.update()
    err = max((r.world('hand_' + s) - p).length for s, p in want.items())
    r.meta['pin_err'] = err


def _rot(spec):
    el, roll, yr = (list(spec.get('rot', (0.0, 0.0, 0.0))) + [0.0, 0.0, 0.0])[:3]
    return Euler((math.radians(-el), math.radians(roll), math.radians(-yr)), 'YXZ').to_matrix()


def place_props(r):
    w = r.state.get('_work')
    if not w:
        return
    rootm = r.j['root'].matrix_world
    facing = rootm.to_3x3().normalized()
    empties = r.meta.get('op_props', {})
    done = {}

    def mat_for(spec):
        R = facing @ _rot(spec)
        if 'root' in spec:
            p = rootm.translation + facing @ RFZ(spec['root'])
        elif 'hand' in spec:
            p = r.world('hand_' + spec['hand']) + facing @ RFZ(spec.get('off', (0, 0, 0)))
        else:
            pm = solve(spec['parent'])
            p = pm @ RFZ(spec.get('off', (0, 0, 0)))
            R = pm.to_3x3().normalized() @ _rot(spec)
        sc = spec.get('scale', (1.0, 1.0, 1.0))
        return Matrix.Translation(p) @ R.to_4x4() @ Matrix.Diagonal((sc[0], sc[1], sc[2], 1.0))

    def solve(name):
        if name not in done:
            done[name] = mat_for(w['props'][name])
        return done[name]

    for name in w.get('props', {}):
        m = solve(name)
        if name in empties:
            empties[name].matrix_world = m
    for key in ('fx', 'fx2'):
        spec = w.get(key)
        e = r.meta['markers'].get('op_' + key)
        if spec and e is not None:
            m = mat_for(spec)
            e.matrix_world = Matrix.Translation(m.translation)


def add_work_tools(rig, role):
    """Build the role's tools (hidden outside 'operate'), the fx markers and the callbacks."""
    for name, fn in TOOLS[role].items():
        _tool(rig, name, fn)
    mk = rig.meta.setdefault('markers', {})
    for key in ('fx', 'fx2'):
        mk['op_' + key] = g.empty('op_' + key)
    rig.strings.insert(0, pin_hands)
    rig.strings.append(place_props)
    return rig
