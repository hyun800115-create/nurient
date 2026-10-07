"""
vil2_dress.py - hair, hats, outfits and props for the batch-2 residents
(CONTRACT_V3 section D).  Not run directly (imported by vil2_build.py).

Same conventions as vil_dress.py (batch 1, unchanged and reused here): every
dress_<key>(rig, spec) works on the STANDARD body from vil_body.build_body,
before vil_body.apply_proportions() turns it into a big / teen / toddler body.
Spine-local coordinates: front = -Y, character's right = -X, z = 0 at the hips.

New pieces
  carriers   make_jige (Korean A-frame back carrier, porter_a)
             make_pack_frame (big external backpack frame with a load shelf, porter_b)
             -> both add an empty 'carry_marker' at the shelf (stack bottom) that
                vil2_render turns into carryPoint
  hand props bag (clerks' paper grocery bag) / dish (chef's plate of roast fish),
             shown in 'serve' and carried between both hands;
             palette + brush (painter, idle/talk);
             spear (guard, always upright in the LEFT fist) + spear_back (slung,
             used for carry_walk)
  outfits    striped apron, headscarf, bob, vest + bow tie + oversleeves, leg
             wraps, quilted onesuit with a snowman hood, captain hat, toque,
             postal cap + satchel, lab coat + stethoscope, paint smock, fur
             helmet + gambeson, ear-flap hat + skating dress + ice skates

Dynamic props are unparented empties re-placed every frame by a Rig.strings
callback (like grandpa's cane), so they keep a sensible orientation no matter
how the IK twists the forearm.
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

PI = math.pi
TAU = math.tau
M = cb.M
HEAD_R, HEAD_C = cb.HEAD_R, cb.HEAD_C
smoothstep = cb.smoothstep
ho = vd.ho
face_obj = vd.face_obj

STD = vd.std_profile(0.25, -0.095)


# --------------------------------------------------------------------------- helpers

def torso_pt(az_deg, z, out=0.012, prof=None, sy=0.84):
    """Point on the (standard) torso surface: az 0 = front, +90 = character's left."""
    sm = g.catmull(prof or STD, 60)
    r = vd.interp_profile(sm, z)
    a = math.radians(az_deg)
    x, y = r * math.sin(a), -r * sy * math.cos(a)
    n = Vector((x / max(r, 1e-4), y / max(r * sy * sy, 1e-4), 0.0)).normalized()
    return tuple(Vector((x, y, z)) + n * out)


def mat_vstripes(name, c1, c2, scale=26.0, rough=0.85):
    """Vertical stripes from object X (aprons)."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    p = nt.nodes.get('Principled BSDF')
    p.inputs['Roughness'].default_value = rough
    tc = nt.nodes.new('ShaderNodeTexCoord')
    sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    nt.links.new(tc.outputs['Object'], sep.inputs[0])
    mul = nt.nodes.new('ShaderNodeMath')
    mul.operation = 'MULTIPLY'
    mul.inputs[1].default_value = scale
    nt.links.new(sep.outputs['X'], mul.inputs[0])
    fr = nt.nodes.new('ShaderNodeMath')
    fr.operation = 'FRACT'
    nt.links.new(mul.outputs[0], fr.inputs[0])
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    cr = ramp.color_ramp
    cr.interpolation = 'CONSTANT'
    cr.elements[0].position = 0.0
    cr.elements[0].color = (*bc.srgb_to_linear(c1), 1)
    cr.elements[1].position = 0.5
    cr.elements[1].color = (*bc.srgb_to_linear(c2), 1)
    nt.links.new(fr.outputs[0], ramp.inputs['Fac'])
    nt.links.new(ramp.outputs['Color'], p.inputs['Base Color'])
    return m


def mat_check(name, c1, c2, scale=40.0, rough=0.85):
    """Small two-colour checks (chef trousers)."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    p = nt.nodes.get('Principled BSDF')
    p.inputs['Roughness'].default_value = rough
    tc = nt.nodes.new('ShaderNodeTexCoord')
    ck = nt.nodes.new('ShaderNodeTexChecker')
    ck.inputs['Scale'].default_value = scale
    ck.inputs['Color1'].default_value = (*bc.srgb_to_linear(c1), 1)
    ck.inputs['Color2'].default_value = (*bc.srgb_to_linear(c2), 1)
    nt.links.new(tc.outputs['Object'], ck.inputs['Vector'])
    nt.links.new(ck.outputs['Color'], p.inputs['Base Color'])
    return m


def mat_splatter(name, base, colors, scale=11.0, size=0.26, rough=0.85):
    """Paint-splattered cloth: random round dabs (Voronoi cells) in a few paint colours."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    p = nt.nodes.get('Principled BSDF')
    p.inputs['Roughness'].default_value = rough
    tc = nt.nodes.new('ShaderNodeTexCoord')
    vo = nt.nodes.new('ShaderNodeTexVoronoi')
    vo.voronoi_dimensions = '3D'
    vo.inputs['Scale'].default_value = scale
    vo.inputs['Randomness'].default_value = 1.0
    nt.links.new(tc.outputs['Object'], vo.inputs['Vector'])
    # paint colour per cell from the cell's random colour (R channel)
    sep = nt.nodes.new('ShaderNodeSeparateColor')
    nt.links.new(vo.outputs['Color'], sep.inputs[0])
    pal = nt.nodes.new('ShaderNodeValToRGB')
    cr = pal.color_ramp
    cr.interpolation = 'CONSTANT'
    k = len(colors)
    cr.elements[0].position = 0.0
    cr.elements[0].color = (*bc.srgb_to_linear(colors[0]), 1)
    cr.elements[1].position = 1.0 / k
    cr.elements[1].color = (*bc.srgb_to_linear(colors[1]), 1)
    for i in range(2, k):
        e = cr.elements.new(i / k)
        e.color = (*bc.srgb_to_linear(colors[i]), 1)
    nt.links.new(sep.outputs[0], pal.inputs['Fac'])
    # dab mask: near the cell centre AND only ~half of the cells (G channel)
    lt = nt.nodes.new('ShaderNodeMath')
    lt.operation = 'LESS_THAN'
    lt.inputs[1].default_value = size
    nt.links.new(vo.outputs['Distance'], lt.inputs[0])
    keep = nt.nodes.new('ShaderNodeMath')
    keep.operation = 'LESS_THAN'
    keep.inputs[1].default_value = 0.55
    nt.links.new(sep.outputs[1], keep.inputs[0])
    mask = nt.nodes.new('ShaderNodeMath')
    mask.operation = 'MULTIPLY'
    nt.links.new(lt.outputs[0], mask.inputs[0])
    nt.links.new(keep.outputs[0], mask.inputs[1])
    mix = nt.nodes.new('ShaderNodeMix')
    mix.data_type = 'RGBA'
    mix.inputs['A'].default_value = (*bc.srgb_to_linear(base), 1)
    nt.links.new(mask.outputs[0], mix.inputs['Factor'])
    nt.links.new(pal.outputs['Color'], mix.inputs['B'])
    nt.links.new(mix.outputs['Result'], p.inputs['Base Color'])
    return m


def dyn_prop(rig, name, anchor, offset=(0, 0, 0), rot=(0, 0, 0), frame='chest'):
    """Unparented empty re-placed every frame at anchor(rig) + frame-relative offset,
    oriented like `frame` (a joint) then rotated by `rot` (deg, XYZ).  Children of the
    returned empty are the prop meshes; register them as toggles yourself."""
    e = g.empty(name + '_dyn')
    R0 = Euler([math.radians(a) for a in rot], 'XYZ').to_matrix().to_4x4()
    kids = []

    def update(r):
        if kids and all(o.hide_render for o in kids):
            return
        Rf = r.j[frame].matrix_world.to_3x3().normalized()
        p = anchor(r) + Rf @ Vector(offset)
        e.matrix_world = Matrix.Translation(p) @ Rf.to_4x4() @ R0
    rig.strings.append(update)
    rig.meta.setdefault('dyn', {})[name] = e
    return e, kids


def hands_mid(r):
    return (r.world('hand_R') + r.world('hand_L')) * 0.5


def child(kids, name, bm, mat, parent, loc=(0, 0, 0), rot=None):
    o = g.mesh_obj(name, bm, mat, parent, loc=loc, rot=rot)
    kids.append(o)
    return o


def marker(rig, name, parent, loc):
    e = g.empty(name, parent, loc)
    rig.meta.setdefault('markers', {})[name] = e
    return e


def knot_tails(rig, mat, loc, s=1.0, droop=(20, 0, 0)):
    """Cloth knot with two short tails at a head-local spot (headbands, kerchiefs)."""
    ho(rig, 'knot', g.bm_ellipsoid(0.045 * s, 0.035 * s, 0.040 * s, 12, 8), mat, loc=loc)
    for sx in (-1, 1):
        ho(rig, 'knot_tail', g.bm_box(0.05 * s, 0.014 * s, 0.10 * s, bevel=0.007), mat,
           loc=(loc[0] + sx * 0.035 * s, loc[1] + 0.012, loc[2] - 0.055 * s), rot=(droop[0], sx * 22, sx * 8))


def bob_hair(rig, color, fringe=0.30, back_low=-0.36, side_low=-0.30, base=1.10, flare=0.07):
    """Chin-length bob: blunt fringe, sides to the jaw, slight flare at the ends."""
    def radial(x, y, z):
        front = smoothstep(-0.32, 0.30, -y)
        edge_front = fringe + 0.025 * math.cos(x * 16.0)
        edge_front = min(edge_front, side_low + (1 - abs(x)) * 2.2)
        edge = back_low * (1 - front) + edge_front * front
        t = smoothstep(edge - 0.05, edge + 0.04, z)
        f = 0.90 + (base - 0.90) * t
        f *= 1.0 + flare * t * smoothstep(0.15, -0.30, z) * (1 - 0.7 * front)
        return f * (1.0 + 0.05 * max(0.0, z) ** 2)
    return cb.shell(rig, M('hair', color, rough=0.42), radial, 'bob')


def snow_hood(rig, mat, rim_mat, scale=1.17):
    """Puffy hood with a round face opening (toddler onesuit)."""
    def hood(x, y, z):
        face = smoothstep(0.02, 0.42, -y) * smoothstep(-0.98, -0.62, z) * \
            (1 - smoothstep(0.46, 0.62, z)) * (1 - smoothstep(0.72, 0.90, abs(x)))
        f = scale - (scale - 0.86) * face
        return f * (1.0 + 0.05 * max(0.0, z) ** 2)
    cb.shell(rig, mat, hood, 'hood')
    ho(rig, 'hood_rim', g.bm_ring(0.240, 0.046, seg=56, segr=12, sy=1.0, tufts=12, bump=0.42, seed=3.3),
       rim_mat, loc=(0, -0.182, -0.015), rot=(76, 0, 0))


# --------------------------------------------------------------------------- carriers

WOOD_A = '#B07C48'
WOOD_B = '#8A5A33'
STRAW = '#D9B56A'
STRAW_D = '#B8914A'


def _pole_x(z, top_z=0.66, bot_z=-0.16, top_x=0.15, bot_x=0.215):
    t = (top_z - z) / (top_z - bot_z)
    return top_x + (bot_x - top_x) * t


def make_jige(rig):
    """Korean A-frame back carrier: two forked poles (narrow at the top), cross
    slats, a straw back pad, straw shoulder ropes and the two backward branches
    (the shelf) the load sits on.  Built on the spine; 'carry_marker' = stack bottom."""
    sp = rig.j['spine']
    wa = M('jige_wood', WOOD_A, rough=0.7)
    wb = M('jige_wood_d', WOOD_B, rough=0.7)
    straw = M('jige_straw', STRAW, rough=0.95)
    straw_d = M('jige_straw_d', STRAW_D, rough=0.95)
    top_z, bot_z = 0.66, -0.17
    for s in (-1, 1):
        pts = [(s * 0.150, 0.262, top_z), (s * 0.180, 0.282, 0.26), (s * 0.217, 0.302, bot_z)]
        g.mesh_obj('jige_pole', g.bm_tube_path(vd.catmull3(pts, 10), lambda t: 0.026 + 0.004 * t, segr=10),
                   wa, sp)
        g.mesh_obj('jige_cap', g.bm_ellipsoid(0.028, 0.028, 0.026, 10, 6), wb, sp, loc=(s * 0.150, 0.262, top_z))
        g.mesh_obj('jige_foot', g.bm_ellipsoid(0.031, 0.031, 0.024, 10, 6), wb, sp, loc=(s * 0.217, 0.302, bot_z))
        # the forked branch (shelf) sticking out backward and up
        bp = [(s * 0.200, 0.292, 0.035), (s * 0.204, 0.400, 0.085), (s * 0.198, 0.505, 0.155)]
        g.mesh_obj('jige_branch', g.bm_tube_path(vd.catmull3(bp, 10), lambda t: 0.024 - 0.008 * t, segr=10),
                   wa, sp)
        g.mesh_obj('jige_branch_tip', g.bm_ellipsoid(0.017, 0.017, 0.017, 8, 6), wb, sp, loc=bp[-1])
    for z in (0.56, 0.42, 0.28, 0.14):
        x = _pole_x(z) - 0.004
        y = 0.262 + (0.302 - 0.262) * (top_z - z) / (top_z - bot_z)
        g.mesh_obj('jige_slat', g.bm_tube_path([(-x, y, z), (x, y, z)], 0.017, segr=8), wb, sp)
    # straw rope wrapped on the top slat + the pad against the back
    xt = _pole_x(0.56)
    for k in range(7):
        x = -xt + 0.03 + (2 * xt - 0.06) * k / 6
        g.mesh_obj('jige_wrap', g.bm_ring(0.0, 0.024, seg=10, segr=8), straw_d, sp,
                   loc=(x, 0.266, 0.56), rot=(0, 90, 0))
    pad = g.bm_box(0.26, 0.055, 0.30, bevel=0.025, segs=3)
    vd.fuzz(pad, 0.004, 60.0)
    g.mesh_obj('jige_pad', pad, straw, sp, loc=(0, 0.218, 0.25))
    # shoulder ropes: top slat -> over the shoulder -> down the chest -> under the arm -> pole
    for s in (-1, 1):
        a = 1 if s > 0 else -1
        pts = [(s * 0.115, 0.262, 0.52), (s * 0.125, 0.140, 0.462), (s * 0.123, 0.020, 0.432),
               torso_pt(a * 34, 0.360, 0.016), torso_pt(a * 38, 0.250, 0.018), torso_pt(a * 66, 0.120, 0.018),
               torso_pt(a * 118, 0.060, 0.018), (s * 0.208, 0.292, 0.040)]
        g.mesh_obj('jige_rope', g.bm_tube_path(vd.catmull3(pts, 34), 0.019, segr=8), straw, sp)
    marker(rig, 'carry_marker', sp, (0.0, 0.420, 0.138))


def make_pack_frame(rig):
    """Big external pack frame: red ladder frame with an arched top that peeks over
    the head, navy canvas panel, padded straps + hip belt, and a plank shelf at the
    bottom for the load; 'carry_marker' = stack bottom on the shelf."""
    sp = rig.j['spine']
    red = M('pf_frame', '#C8463D', rough=0.45, metal=0.15)
    canvas = M('pf_canvas', '#2E4A7A', rough=0.9)
    pad = M('pf_pad', '#3A3540', rough=0.85)
    wood = M('pf_shelf', '#C98F55', rough=0.65)
    metal = M('pf_metal', '#B9C2CE', rough=0.35, metal=0.6)
    for s in (-1, 1):
        rail = [(s * 0.160, 0.262, -0.10), (s * 0.165, 0.290, 0.40), (s * 0.160, 0.330, 0.90)]
        g.mesh_obj('pf_rail', g.bm_tube_path(vd.catmull3(rail, 12), 0.022, segr=10), red, sp)
        # shelf arms going backward
        g.mesh_obj('pf_arm', g.bm_tube_path([(s * 0.160, 0.262, -0.10), (s * 0.160, 0.52, -0.085)], 0.018,
                                            segr=8), metal, sp)
        g.mesh_obj('pf_strut', g.bm_tube_path([(s * 0.160, 0.282, 0.16), (s * 0.160, 0.50, -0.075)], 0.012,
                                              segr=8), metal, sp)
    arch = [(-0.160, 0.330, 0.90)] + [(-0.160 * math.cos(a), 0.330 + 0.01 * math.sin(a), 0.90 + 0.13 * math.sin(a))
                                     for a in [PI * k / 10 for k in range(1, 10)]] + [(0.160, 0.330, 0.90)]
    g.mesh_obj('pf_arch', g.bm_tube_path(arch, 0.022, segr=10), red, sp)
    for z in (0.06, 0.62, 0.86):
        y = 0.262 + (0.330 - 0.262) * (z + 0.10) / 1.0
        g.mesh_obj('pf_rung', g.bm_tube_path([(-0.16, y, z), (0.16, y, z)], 0.016, segr=8), red, sp)
    panel = g.bm_box(0.30, 0.03, 0.46, bevel=0.03, segs=3)
    g.mesh_obj('pf_panel', panel, canvas, sp, loc=(0, 0.262, 0.34), rot=(-4, 0, 0))
    for z in (0.20, 0.36, 0.50):
        g.mesh_obj('pf_strap_h', g.bm_box(0.31, 0.012, 0.022, bevel=0.005), M('pf_web', '#E8C25A', rough=0.7),
                   sp, loc=(0, 0.282 + 0.01 * z, z), rot=(-4, 0, 0))
    shelf = g.bm_box(0.36, 0.27, 0.026, bevel=0.008)
    g.mesh_obj('pf_shelf', shelf, wood, sp, loc=(0, 0.395, -0.090))
    g.mesh_obj('pf_lip', g.bm_box(0.36, 0.018, 0.045, bevel=0.006), wood, sp, loc=(0, 0.520, -0.070))
    # small tin cup hanging on the left rail (charm)
    g.mesh_obj('pf_cup', g.bm_lathe([(0.0, 0.0), (0.034, 0.0), (0.040, 0.06), (0.042, 0.065)], seg=16,
                                     cap_top=False), metal, sp, loc=(0.20, 0.33, 0.44), rot=(0, 0, 0))
    # padded shoulder straps + hip belt
    for s in (-1, 1):
        a = 1 if s > 0 else -1
        pts = [(s * 0.105, 0.272, 0.56), (s * 0.120, 0.140, 0.462), (s * 0.120, 0.020, 0.432),
               torso_pt(a * 32, 0.360, 0.018), torso_pt(a * 36, 0.240, 0.020), torso_pt(a * 60, 0.150, 0.020),
               torso_pt(a * 115, 0.110, 0.018), (s * 0.160, 0.285, 0.12)]
        g.mesh_obj('pf_strap', g.bm_tube_path(vd.catmull3(pts, 34), 0.020, segr=10, side_ref=(0, 0, 1), flat=1.5),
                   pad, sp)
    g.mesh_obj('pf_belt', g.bm_ring(0.240, 0.026, seg=56, segr=10, sy=0.86, rz=1.2), pad, sp, loc=(0, 0, 0.0))
    g.mesh_obj('pf_buckle', g.bm_box(0.06, 0.02, 0.05, bevel=0.008), metal, sp, loc=(0, -0.226, 0.0))
    marker(rig, 'carry_marker', sp, (0.0, 0.392, -0.072))


# --------------------------------------------------------------------------- hand props

def make_bag(rig):
    """Kraft-paper grocery bag with a baguette and greens poking out (clerk 'serve')."""
    e, kids = dyn_prop(rig, 'bag', hands_mid, offset=(0, -0.045, 0.050))
    paper = M('bag_paper', '#DDB57E', rough=0.85)
    child(kids, 'bag_body', g.bm_box(0.19, 0.11, 0.17, bevel=0.014), paper, e, loc=(0, 0, 0))
    child(kids, 'bag_fold', g.bm_box(0.192, 0.112, 0.024, bevel=0.006), M('bag_fold', '#C29358', rough=0.85), e,
          loc=(0, 0, 0.078))
    child(kids, 'bag_seal', g.bm_ellipsoid(0.030, 0.008, 0.030, 12, 6), M('bag_seal', '#E04848', rough=0.5), e,
          loc=(0, -0.058, 0.025))
    child(kids, 'baguette', g.bm_capsule(0.026, 0.14, seg=12, rings=6), M('baguette', '#E3A456', rough=0.6), e,
          loc=(-0.040, 0.01, 0.215), rot=(0, -14, 0))
    for k, (x, tl) in enumerate(((0.030, 10), (0.055, 28))):
        child(kids, 'greens', g.bm_ellipsoid(0.020, 0.012, 0.050, 10, 6), M('greens', '#5FB14E', rough=0.6), e,
              loc=(x, 0.0, 0.11), rot=(0, tl, 0))
    rig.toggle('bag', kids)
    rig.meta.setdefault('serve_prop', e)


def make_dish(rig):
    """White plate with a golden roast fish + lemon + a leaf (chef 'serve')."""
    e, kids = dyn_prop(rig, 'dish', hands_mid, offset=(0, -0.03, 0.035))
    child(kids, 'plate', g.bm_lathe([(0.0, 0.0), (0.10, 0.0), (0.135, 0.022), (0.140, 0.026), (0.128, 0.020),
                                     (0.0, 0.012)], seg=32, cap_top=False),
          M('plate', '#F7F5F0', rough=0.3, emission='#FFFFFF', emission_strength=0.08), e)
    fish = g.bm_ellipsoid(0.11, 0.050, 0.038, 18, 10)
    child(kids, 'roast_fish', fish, M('roast_fish', '#D9893E', rough=0.45), e, loc=(-0.01, 0, 0.040), rot=(0, 0, 25))
    child(kids, 'roast_tail', g.bm_ellipsoid(0.040, 0.012, 0.032, 12, 6), M('roast_fish_d', '#B8632A', rough=0.5),
          e, loc=(0.105, 0.045, 0.045), rot=(0, 0, 25 + 70))
    for k in range(3):
        child(kids, 'grill', g.bm_box(0.012, 0.075, 0.006, bevel=0.002), M('grill', '#7A3E1E', rough=0.6), e,
              loc=(-0.05 + 0.04 * k, 0.0, 0.077), rot=(0, 0, 25 + 20))
    child(kids, 'lemon', g.bm_ellipsoid(0.028, 0.028, 0.010, 12, 6), M('lemon', '#F2D24A', rough=0.4), e,
          loc=(-0.08, 0.06, 0.02))
    child(kids, 'leaf', g.bm_ellipsoid(0.030, 0.014, 0.008, 10, 6), M('leaf', '#5FB14E', rough=0.5), e,
          loc=(0.06, 0.07, 0.02), rot=(0, 0, -30))
    rig.toggle('dish', kids)
    rig.meta.setdefault('serve_prop', e)


def make_palette(rig):
    """Wooden kidney palette with paint dabs (left hand) + a brush (right hand)."""
    e, kids = dyn_prop(rig, 'palette', lambda r: r.world('hand_L'), offset=(0.03, -0.035, 0.035),
                       rot=(-58, 0, 18))
    wood = M('palette_wood', '#D9A867', rough=0.55)
    outline = []
    for k in range(32):
        t = TAU * k / 32
        rr = 1.0 - 0.28 * math.exp(-((t - PI) % TAU - PI) ** 2 / 0.12)        # bite at angle pi
        outline.append((0.115 * rr * math.cos(t), 0.085 * rr * math.sin(t)))
    slab = g.bm_slab([(y, x) for x, y in outline], 0.012, bevel=0.004)
    g.bm_transform(slab, Matrix.Rotation(PI / 2, 4, 'Y'))                       # outline into XY, thin along Z
    child(kids, 'palette', slab, wood, e)
    for k, (col, u, v) in enumerate((('#E04848', 0.045, 0.040), ('#F2C230', 0.075, -0.005), ('#3D7CC9', 0.040,
                                                                                          -0.045),
                                     ('#5FB14E', -0.010, 0.055), ('#F4F1EA', -0.005, -0.055))):
        child(kids, 'paint', g.bm_ellipsoid(0.024, 0.022, 0.012, 12, 6), M('paint_' + col, col, rough=0.25), e,
              loc=(u, v, 0.010))
    child(kids, 'palette_hole', g.bm_ellipsoid(0.016, 0.016, 0.009, 10, 6), M('palette_hole', '#6E4428', rough=0.6),
          e, loc=(-0.07, 0.0, 0.006))
    rig.toggle('palette', kids)

    b, bk = dyn_prop(rig, 'brush', lambda r: r.world('hand_R'), offset=(0.0, -0.02, 0.02), rot=(-30, -25, 0))
    child(bk, 'brush_handle', g.bm_lathe([(0.0, -0.06), (0.010, -0.055), (0.008, 0.10), (0.0, 0.105)], seg=10,
                                         smooth_n=0), M('brush_handle', '#C8463D', rough=0.4), b)
    child(bk, 'brush_ferrule', g.bm_cyl(0.011, 0.011, 0.03, seg=10), M('brush_ferrule', '#B9C2CE', rough=0.3,
                                                                         metal=0.7), b, loc=(0, 0, 0.10))
    child(bk, 'brush_tip', g.bm_lathe([(0.011, 0.0), (0.012, 0.02), (0.0, 0.05)], seg=10),
          M('brush_tip', '#3D7CC9', rough=0.5), b, loc=(0, 0, 0.13))
    rig.toggle('brush', bk)


def _spear_parts(parent, length=1.64):
    """Spear built along +Z from the butt (z=0); returns objects."""
    shaft = M('spear_shaft', '#8A5A33', rough=0.55)
    steel = M('spear_steel', '#D7DFE8', rough=0.25, metal=0.7)
    red = M('spear_tassel', '#D23A32', rough=0.9)
    objs = [g.mesh_obj('spear_shaft', g.bm_cyl(0.017, 0.015, length - 0.20, seg=10), shaft, parent),
            g.mesh_obj('spear_butt', g.bm_lathe([(0.0, -0.02), (0.020, -0.012), (0.020, 0.05), (0.0, 0.06)], seg=10),
                       steel, parent)]
    # leaf-shaped blade
    blade = []
    for k in range(13):
        t = k / 12
        w = 0.040 * math.sin(PI * min(1.0, t * 1.25)) ** 0.8 * (1 - t) ** 0.25
        blade.append((w, t))
    prof = [(w, length - 0.21 + 0.21 * t) for w, t in blade]
    prof[0] = (0.016, prof[0][1])
    prof[-1] = (0.0, prof[-1][1])
    objs.append(g.mesh_obj('spear_blade', g.bm_lathe(prof, seg=4, sx=1.0, sy=0.30), steel, parent))
    objs.append(g.mesh_obj('spear_collar', g.bm_cyl(0.021, 0.021, 0.035, seg=10), M('spear_brass', '#D9A520',
                                                                                     rough=0.35, metal=0.6),
                           parent, loc=(0, 0, length - 0.235)))
    tas = g.bm_lathe([(0.0, -0.09), (0.030, -0.075), (0.040, -0.03), (0.024, 0.0), (0.0, 0.004)], seg=14,
                     smooth_n=10)
    vd.fuzz(tas, 0.004, 60.0)
    objs.append(g.mesh_obj('spear_tassel', tas, red, parent, loc=(0, 0, length - 0.24)))
    return objs


def make_spear(rig, length=1.64):
    """Upright spear through the LEFT fist (dynamic) + a copy slung on the back."""
    e = g.empty('spear_dyn')
    objs = _spear_parts(e, length)
    for o in objs:
        o.parent = e
    rig.toggle('spear', objs)

    def update(r):
        if objs[0].hide_render:
            return
        grip = r.world('hand_L') + r.j['chest'].matrix_world.to_3x3().normalized() @ Vector((0.0, -0.01, 0.0))
        up = r.j['chest'].matrix_world.to_3x3().normalized() @ Vector((0, 0, 1))
        axis = (Vector((0, 0, 1)) * 0.75 + up * 0.25).normalized()
        fwd = r.j['root'].matrix_world.to_3x3() @ Vector((0, -1, 0))
        axis = (axis + fwd * 0.06).normalized()
        butt_len = max(0.30, min(0.66, (grip.z - 0.015) / max(axis.z, 0.5)))
        butt = grip - axis * butt_len
        zx = axis
        xx = fwd.cross(zx)
        if xx.length < 1e-4:
            xx = Vector((1, 0, 0))
        xx.normalize()
        yy = zx.cross(xx)
        m = Matrix((xx, yy, zx)).transposed().to_4x4()
        e.matrix_world = Matrix.Translation(butt) @ m
    rig.strings.append(update)

    back = g.empty('spear_back_e', rig.j['spine'], (0.0, 0.0, 0.0))
    bobjs = _spear_parts(back, length * 0.92)
    back.location = (-0.30, 0.255, -0.30)
    back.rotation_mode = 'XYZ'
    back.rotation_euler = (math.radians(-6), math.radians(28), 0.0)
    rig.toggle('spear_back', bobjs)


def make_skates(rig, blade_h=0.045):
    """White skate boots get a steel runner (2 posts + a curled blade) under the sole."""
    steel = M('skate_blade', '#D7DFE8', rough=0.22, metal=0.75)
    lace = M('skate_lace', '#9FD0F2', rough=0.6)
    for side in ('R', 'L'):
        kn = rig.j['knee_' + side]
        sole = -0.188
        zb = sole - blade_h
        run = [(0, -0.140, zb + 0.030), (0, -0.150, zb + 0.008), (0, -0.120, zb), (0, 0.070, zb), (0, 0.085,
                                                                                                   zb + 0.010)]
        g.mesh_obj('skate_runner', g.bm_tube_path(vd.catmull3(run, 14), 0.0075, segr=6, side_ref=(1, 0, 0),
                                                  flat=0.55), steel, kn)
        for y in (-0.085, 0.040):
            g.mesh_obj('skate_post', g.bm_cyl(0.014, 0.012, blade_h, seg=8), steel, kn, loc=(0, y, zb))
        g.mesh_obj('skate_plate', g.bm_box(0.06, 0.20, 0.010, bevel=0.003), steel, kn, loc=(0, -0.025, sole - 0.004))
        for k in range(3):
            g.mesh_obj('skate_lace', g.bm_box(0.075, 0.010, 0.010, bevel=0.003), lace, kn,
                       loc=(0, -0.070 - 0.004 * k, -0.150 + 0.028 * k), rot=(-30, 0, 0))
    rig.meta['blade_h'] = blade_h


# --------------------------------------------------------------------------- characters

def dress_clerk_a(rig, spec):
    """점원 미소: bob, red headscarf, red/white striped apron with a name tag."""
    hair = spec['hair']
    bob_hair(rig, hair, fringe=0.30, back_low=-0.38, side_low=-0.32, base=1.10, flare=0.08)
    scarf = M('headscarf', '#E04848', rough=0.85)
    cb.cap_shell(rig, scarf, lambda x, y: 0.30 - 0.38 * y, base=1.150, puff=0.05, name='headscarf', soft=0.035)
    cb.tilted_ring(rig, 'headscarf_hem', M('headscarf_hem', '#FBF6EC', rough=0.85), HEAD_R[0] * 1.075, 0.016,
                   0.66, -0.10, sy=0.97, rz=1.0)
    knot_tails(rig, scarf, (0.0, 0.322, -0.040), s=1.0)
    apron = mat_vstripes('apron_stripes', '#E04848', '#FBF6EC', scale=24.0)
    hz = spec.get('hem_z', -0.12)
    hr = spec.get('hem_r', 0.26)
    g.mesh_obj('apron', vd.sector_lathe([(hr + 0.020, hz - 0.035), (0.240, 0.0), (0.224, 0.10), (0.220, 0.14)],
                                        keep_deg=58, sy=0.88), apron, rig.j['spine'])
    g.mesh_obj('apron_bib', vd.sector_lathe([(0.216, 0.12), (0.213, 0.22), (0.202, 0.31)], keep_deg=36, sy=0.88),
               apron, rig.j['spine'])
    g.mesh_obj('apron_hem', vd.sector_lathe([(hr + 0.024, hz - 0.040), (hr + 0.024, hz - 0.012)], keep_deg=59,
                                            sy=0.88), M('apron_trim', '#C8343A', rough=0.8), rig.j['spine'])
    cb.belt(rig, '#C8343A', z=0.13, r=0.216, buckle=None, width=0.40)
    for s in (-1, 1):
        g.mesh_obj('apron_strap', g.bm_tube_path([(s * 0.075, -0.180, 0.30), (s * 0.095, -0.12, 0.40),
                                                  (s * 0.10, 0.0, 0.43)], 0.012, segr=6),
                   M('apron_trim', '#C8343A', rough=0.8), rig.j['spine'])
    # bow at the back
    for s in (-1, 1):
        g.mesh_obj('apron_bow', g.bm_ellipsoid(0.05, 0.02, 0.032, 12, 8), M('apron_trim', '#C8343A', rough=0.8),
                   rig.j['spine'], loc=(s * 0.045, 0.19, 0.13), rot=(0, s * -20, 0))
    # name tag on the bib
    g.mesh_obj('name_tag', g.bm_box(0.075, 0.012, 0.042, bevel=0.006), M('tag', '#FFFFFF', rough=0.4,
                                                                         emission='#FFFFFF', emission_strength=0.15),
               rig.j['spine'], loc=(0.055, -0.196, 0.245), rot=(-8, 0, -6))
    g.mesh_obj('name_tag_s', g.bm_box(0.077, 0.013, 0.012, bevel=0.003), M('tag_s', '#3D7CC9', rough=0.4),
               rig.j['spine'], loc=(0.055, -0.197, 0.262), rot=(-8, 0, -6))
    # rounded white collar
    for s in (-1, 1):
        g.mesh_obj('collar', g.bm_ellipsoid(0.065, 0.028, 0.038, 14, 8), M('collar_w', '#FBF6EC', rough=0.7),
                   rig.j['chest'], loc=(s * 0.055, -0.115, 0.085), rot=(30, s * 18, s * 20))
    make_bag(rig)


def dress_clerk_b(rig, spec):
    """점원 민호: side-parted hair, white shirt, green vest, red bow tie, oversleeves."""
    hair = spec['hair']
    cb.hair_shell(rig, hair, fringe=0.38, wave=0.03, waves=6.0, sweep=0.32, back_low=-0.42, top_puff=0.09,
                  base=1.09)
    ho(rig, 'part', g.bm_tube_path([cb.head_point(0.42, el, out=0.022)[0] for el in (0.45, 0.75, 1.05)], 0.007,
                                   segr=6), M('part', '#2A1E1A', rough=0.5))
    cb.hair_tuft(rig, hair, -0.30, 0.55, size=(0.08, 0.05, 0.10), tilt=(-70, 0, 0), name='swoop')
    cb.hair_tuft(rig, hair, -0.05, 0.62, size=(0.07, 0.05, 0.09), tilt=(-72, 0, 0), name='swoop')
    vest = M('vest', '#3F7A4A', rough=0.8)
    g.mesh_obj('vest', cb.vest_lathe([(0.250, -0.095), (0.246, 0.0), (0.232, 0.12), (0.222, 0.24), (0.205, 0.31),
                                      (0.165, 0.38)], gap_deg=20, seg=44, sy=0.88), vest, rig.j['spine'])
    gold = M('vest_btn', '#E0B040', rough=0.3, metal=0.6)
    for z in (0.02, 0.10, 0.18):
        g.mesh_obj('button', g.bm_ellipsoid(0.015, 0.010, 0.015, 10, 6), gold, rig.j['spine'],
                   loc=(0.075, -0.205, z))
    for s in (-1, 1):
        g.mesh_obj('vest_pocket', g.bm_box(0.07, 0.012, 0.012, bevel=0.004), M('vest_d', '#2F5E38', rough=0.8),
                   rig.j['spine'], loc=(s * 0.12, -0.185, 0.07), rot=(0, 0, s * 8))
    # shirt collar + bow tie
    for s in (-1, 1):
        g.mesh_obj('collar', g.bm_ellipsoid(0.050, 0.020, 0.034, 12, 8), M('collar_w', '#FBF8F0', rough=0.6),
                   rig.j['chest'], loc=(s * 0.048, -0.118, 0.080), rot=(35, s * 20, s * 35))
    bt = M('bowtie', '#D23A32', rough=0.5)
    for s in (-1, 1):
        g.mesh_obj('bowtie_w', g.bm_ellipsoid(0.040, 0.016, 0.026, 12, 8), bt, rig.j['chest'],
                   loc=(s * 0.036, -0.150, 0.045), rot=(0, s * -10, 0))
    g.mesh_obj('bowtie_k', g.bm_ellipsoid(0.017, 0.016, 0.019, 10, 6), bt, rig.j['chest'], loc=(0, -0.158, 0.045))
    # oversleeves (토시) on the forearms
    osl = M('oversleeve', '#3A3F52', rough=0.75)
    for n in ('R', 'L'):
        g.mesh_obj('oversleeve', g.bm_capsule(0.080, cb.FOREARM - 0.035, r_end=0.072), osl, rig.j['el_' + n],
                   loc=(0, 0, -0.010))
        for z in (-0.012, -cb.FOREARM + 0.022):
            g.mesh_obj('oversleeve_band', g.bm_ring(0.077, 0.012, seg=24, segr=6), M('band', '#E0B040', rough=0.5),
                       rig.j['el_' + n], loc=(0, 0, z))
    cb.belt(rig, '#3B2A20', z=-0.07, r=0.240, buckle='#E0B040', width=0.42)
    make_bag(rig)


def dress_porter_a(rig, spec):
    """짐꾼 곰돌: big & sturdy, spiky hair + white headband, quilted vest, work
    gloves, leg wraps and the A-frame carrier."""
    hair = spec['hair']
    cb.hair_shell(rig, hair, fringe=0.42, wave=0.07, waves=12.0, sweep=0.0, back_low=-0.40, top_puff=0.05)
    for az, el in ((-0.35, 1.0), (0.05, 1.08), (0.42, 0.98), (PI, 0.70), (2.5, 0.80), (-2.5, 0.80)):
        cb.hair_tuft(rig, hair, az, el, size=(0.05, 0.04, 0.075), tilt=(-30 if abs(az) < 1 else 50, 0, 0),
                     name='spike')
    band = M('headband', '#F4F1EA', rough=0.85)
    cb.tilted_ring(rig, 'headband', band, HEAD_R[0] * 1.035, 0.030, 0.42, 0.16, sy=0.97, rz=1.5)
    knot_tails(rig, band, (0.0, 0.312, 0.035), s=1.0)
    # quilted vest pieces are the torso itself (spec quilted); undershirt sleeves come from spec
    cb.collar_fur(rig, spec, R=0.135, r=0.055, dz=0.095, bump=0.20, tufts=8,
                  mat=M('collar_k', '#E8DCC0', rough=0.95))
    g.mesh_obj('belt_rope', g.bm_ring(0.258, 0.026, seg=56, segr=8, sy=0.86, rz=1.0), M('rope', STRAW_D, rough=0.95),
               rig.j['spine'], loc=(0, 0, 0.005))
    # work gloves: cuff rings
    for n in ('R', 'L'):
        g.mesh_obj('glove_cuff', g.bm_ring(0.050, 0.020, seg=24, segr=8), M('glove_cuff', '#8A5A33', rough=0.7),
                   rig.j['hand_' + n], loc=(0, 0, 0.040))
        # leg wraps (행전) + ties
        g.mesh_obj('legwrap', g.bm_capsule(0.069, 0.060, r_end=0.066), M('legwrap', '#EDE6D6', rough=0.9),
                   rig.j['knee_' + n], loc=(0, 0, 0.0))
        g.mesh_obj('legwrap_tie', g.bm_ring(0.068, 0.010, seg=24, segr=6), M('legtie', '#5A4636', rough=0.8),
                   rig.j['knee_' + n], loc=(0, 0, -0.035))
    make_jige(rig)


def dress_porter_b(rig, spec):
    """짐꾼 다람: small & quick, rust beanie with squirrel ears, fluffy striped scarf,
    green puffer and the big pack frame."""
    hair = spec['hair']
    cb.hair_shell(rig, hair, fringe=0.30, wave=0.09, waves=11.0, sweep=0.10, back_low=-0.45, top_puff=0.06)
    for az in (-0.35, 0.0, 0.30):
        cb.hair_tuft(rig, hair, az, 0.30, size=(0.05, 0.035, 0.08), tilt=(-80, 0, 0), name='bang')
    knit = M('beanie', '#C9733A', rough=0.92)
    cb.cap_shell(rig, knit, lambda x, y: 0.26 - 0.18 * y, base=1.13, puff=0.22, name='beanie', lumps=0.03)
    cb.tilted_ring(rig, 'beanie_cuff', M('beanie_cuff', '#A85A2A', rough=0.92), HEAD_R[0] * 1.08, 0.046, 0.46,
                   0.02, sy=0.97, rz=1.2)
    for s in (-1, 1):
        p, n = cb.head_point(s * 0.62, 0.86, out=0.02, radii=tuple(r * 1.15 for r in HEAD_R))
        q = n.to_track_quat('Z', 'Y')
        ho(rig, 'sq_ear', g.bm_lathe([(0.0, 0.0), (0.060, 0.015), (0.050, 0.065), (0.0, 0.11)], seg=14, smooth_n=8,
                                     sy=0.55), knit, loc=(p.x, p.y, p.z), rot=q)
        ho(rig, 'sq_ear_tip', g.bm_ellipsoid(0.025, 0.020, 0.035, 10, 6), M('beanie_cuff', '#A85A2A', rough=0.92),
           loc=tuple(p + n * 0.10), rot=q)
    vd.scarf_ring(rig, '#F4E6CC', stripe='#A85A2A', R=0.135, r=0.072, dz=0.10)
    vd.striped_tail(rig, rig.j['chest'], [(0.08, -0.16, 0.08), (0.10, -0.21, -0.02), (0.11, -0.23, -0.14)], 0.050,
                    ['#F4E6CC', '#A85A2A'], seg_len=0.045, thick=0.045)
    make_pack_frame(rig)


def dress_captain(rig, spec):
    """선장 바다: white beard, captain hat, navy double-breasted pea coat."""
    white = spec['hair']
    wm = M('hair', white, rough=0.75)

    def side_hair(x, y, z):
        band = (1 - smoothstep(0.10, 0.32, z)) * smoothstep(-0.70, -0.40, z) * smoothstep(-0.40, 0.05, y)
        return 0.92 + (1.13 - 0.92) * band
    cb.shell(rig, wm, side_hair, 'side_hair')
    cb.beard(rig, white, edge=-0.30, curve=0.34, base=1.15, chin=0.20)
    ho(rig, 'beard_puff', vd.fuzz(g.bm_ellipsoid(0.17, 0.10, 0.12, 20, 12), 0.008, 35.0), wm, loc=(0, -0.21, -0.25))
    for s in (-1, 1):
        cb.on_head('stache', vd.fuzz(g.bm_ellipsoid(0.075, 0.034, 0.034, 14, 8), 0.004, 50.0), wm, rig.j['head'],
                   s * 0.15, -0.205, out=0.008, tilt=-s * 22)
    # captain hat: white crown, navy band, black visor, gold badge + cord
    crown = g.bm_lathe([(0.0, 0.0), (0.30, 0.0), (0.315, 0.06), (0.355, 0.13), (0.350, 0.155), (0.0, 0.165)],
                       seg=40, smooth_n=12, sy=0.98)
    ho(rig, 'cap_crown', crown, M('cap_white', '#F7F5F0', rough=0.6), loc=(0, 0.01, 0.175), rot=(-9, 0, 0))
    ho(rig, 'cap_band', g.bm_ring(0.302, 0.040, seg=48, segr=10, sy=0.98, rz=1.15), M('cap_navy', '#22305A', rough=0.6),
       loc=(0, 0.012, 0.200), rot=(-9, 0, 0))
    visor = g.bm_lathe([(0.24, 0.006), (0.36, -0.010), (0.37, -0.020), (0.24, -0.008)], seg=40, cap_top=False,
                       cap_bottom=False)
    import bmesh
    kill = [f for f in visor.faces if f.calc_center_median().y > -0.10]
    bmesh.ops.delete(visor, geom=kill, context='FACES')
    ho(rig, 'cap_visor', visor, M('cap_visor', '#1E1E26', rough=0.2), loc=(0, 0.0, 0.165), rot=(-14, 0, 0))
    gold = M('gold', '#E8B33A', rough=0.25, metal=0.8)
    ho(rig, 'cap_badge', g.bm_ellipsoid(0.050, 0.016, 0.042, 14, 8), gold, loc=(0, -0.305, 0.235), rot=(-9, 0, 0))
    ho(rig, 'cap_badge_in', g.bm_ellipsoid(0.026, 0.010, 0.022, 10, 6), M('cap_navy', '#22305A', rough=0.6),
       loc=(0, -0.318, 0.236), rot=(-9, 0, 0))
    ho(rig, 'cap_cord', g.bm_tube_path([(-0.24, -0.20, 0.175), (0.0, -0.315, 0.170), (0.24, -0.20, 0.175)], 0.010,
                                       segr=6), gold)
    # pea coat: wide navy lapels + 2 x 3 gold buttons + pockets
    navy = spec['coat_mat']
    for s in (-1, 1):
        g.mesh_obj('lapel', vd.sector_lathe([(0.222, 0.16), (0.214, 0.24), (0.204, 0.31), (0.170, 0.38)],
                                            keep_deg=11, sy=0.86, center_deg=s * 24),
                   M('lapel', '#1E2A4E', rough=0.8), rig.j['spine'])
        for z in (0.03, 0.12, 0.21):
            g.mesh_obj('button', g.bm_ellipsoid(0.020, 0.011, 0.020, 12, 6), gold, rig.j['spine'],
                       loc=(s * 0.070, -0.198 + 0.008 * (z > 0.15), z))
        g.mesh_obj('pocket', g.bm_box(0.08, 0.012, 0.014, bevel=0.004), M('lapel', '#1E2A4E', rough=0.8),
                   rig.j['spine'], loc=(s * 0.13, -0.190, -0.03), rot=(0, 0, s * 10))
    g.mesh_obj('collar', g.bm_ring(0.14, 0.050, seg=48, segr=10, sy=0.92, rz=1.3), navy, rig.j['chest'],
               loc=(0, 0.015, 0.10))
    for n in ('R', 'L'):
        g.mesh_obj('cuff_stripe', g.bm_ring(0.071, 0.010, seg=24, segr=6), gold, rig.j['el_' + n],
                   loc=(0, 0, -cb.FOREARM + 0.030))


def dress_chef(rig, spec):
    """요리사 쿡: tall puffy toque, white double-breasted jacket, red neckerchief, moustache."""
    hair = spec['hair']
    cb.hair_shell(rig, hair, fringe=0.30, wave=0.05, waves=9.0, sweep=0.0, back_low=-0.45)
    white = M('toque', '#FBFAF6', rough=0.75, emission='#FFFFFF', emission_strength=0.04)
    band = g.bm_lathe([(0.31, 0.0), (0.315, 0.08), (0.322, 0.15), (0.0, 0.151)], seg=40, cap_bottom=False)
    for v in band.verts:                     # pleats
        a = math.atan2(v.co.y, v.co.x)
        if v.co.z > 0.005:
            f = 1 + 0.025 * math.cos(16 * a)
            v.co.x *= f
            v.co.y *= f
    ho(rig, 'toque_band', band, white, loc=(0, 0.02, 0.17), rot=(-6, 0, 0))
    top = g.bm_ellipsoid(0.34, 0.33, 0.17, 32, 16)
    vd.fuzz(top, 0.012, 14.0, seed=2.0)
    ho(rig, 'toque_top', top, white, loc=(0, 0.035, 0.40), rot=(-6, 0, 0))
    sm = M('stache', hair, rough=0.7)
    for s in (-1, 1):
        pts = [(s * 0.01, -0.272, -0.07), (s * 0.07, -0.265, -0.085), (s * 0.13, -0.238, -0.078),
               (s * 0.17, -0.212, -0.050), (s * 0.168, -0.206, -0.025)]
        ho(rig, 'stache', g.bm_tube_path(vd.catmull3(pts, 14), lambda t: 0.034 * (1 - 0.6 * t) + 0.006, segr=10), sm)
    # jacket: double-breasted knots, neckerchief
    knot = M('chef_knot', '#E8E2D6', rough=0.6)
    for s in (-1, 1):
        for z in (0.05, 0.15, 0.25):
            g.mesh_obj('button', g.bm_ellipsoid(0.018, 0.012, 0.018, 10, 6), knot, rig.j['spine'],
                       loc=(s * 0.070, -0.192 + 0.012 * (z > 0.2), z))
    g.mesh_obj('jacket_flap', vd.sector_lathe([(0.254, -0.075), (0.236, 0.02), (0.220, 0.10), (0.216, 0.22),
                                               (0.203, 0.31)], keep_deg=22, sy=0.86, center_deg=-14),
               M('chef_flap', '#F2EFE8', rough=0.8), rig.j['spine'])
    red = M('neckerchief', '#D23A32', rough=0.8)
    g.mesh_obj('neckerchief', g.bm_ring(0.13, 0.042, seg=40, segr=10, sy=0.92, rz=1.2), red, rig.j['chest'],
               loc=(0, 0.01, 0.105))
    g.mesh_obj('neck_tri', g.bm_slab([(0.0, 0.0), (0.05, 0.06), (-0.05, 0.06)], 0.014, bevel=0.005), red,
               rig.j['chest'], loc=(0, -0.150, 0.035), rot=(0, 0, -90))
    # little towel tucked in the belt
    g.mesh_obj('towel', g.bm_box(0.07, 0.016, 0.13, bevel=0.010), M('towel', '#9FD0F2', rough=0.9), rig.j['spine'],
               loc=(0.18, -0.13, -0.06), rot=(0, 0, 35))
    make_dish(rig)


def dress_postman(rig, spec):
    """우체부: red cap, blue uniform with brass buttons, leather mail satchel."""
    hair = spec['hair']
    cb.hair_shell(rig, hair, fringe=0.28, wave=0.06, waves=10.0, sweep=0.05, back_low=-0.45)
    red = M('cap_red', '#D23A32', rough=0.6)
    cb.cap_shell(rig, red, lambda x, y: 0.26 - 0.12 * y, base=1.13, puff=0.10, name='cap', soft=0.03)
    ho(rig, 'cap_top', g.bm_ellipsoid(0.32, 0.32, 0.08, 32, 10), red, loc=(0, -0.01, 0.235), rot=(-8, 0, 0))
    visor = g.bm_lathe([(0.0, 0.0), (0.16, 0.0), (0.17, -0.008), (0.0, -0.012)], seg=32, sy=0.62)
    ho(rig, 'cap_visor', visor, M('cap_visor', '#1E1E26', rough=0.25), loc=(0, -0.26, 0.135), rot=(-12, 0, 0))
    ho(rig, 'cap_band', g.bm_ring(0.300, 0.020, seg=48, segr=8, sy=0.99, rz=1.2), M('cap_band', '#22305A', rough=0.6),
       loc=(0, 0.0, 0.150), rot=(-8, 0, 0))
    ho(rig, 'cap_badge', g.bm_ellipsoid(0.040, 0.014, 0.034, 12, 6), M('brass', '#E8B33A', rough=0.3, metal=0.7),
       loc=(0, -0.300, 0.195), rot=(-8, 0, 0))
    brass = M('brass', '#E8B33A', rough=0.3, metal=0.7)
    for z in (0.0, 0.10, 0.20):
        g.mesh_obj('button', g.bm_ellipsoid(0.018, 0.011, 0.018, 10, 6), brass, rig.j['spine'],
                   loc=cb.front_point(z, 0.214 if z < 0.15 else 0.206))
    g.mesh_obj('collar', g.bm_ring(0.135, 0.040, seg=48, segr=10, sy=0.92, rz=1.3), M('collar_red', '#D23A32',
                                                                                    rough=0.7),
               rig.j['chest'], loc=(0, 0.012, 0.098))
    cb.belt(rig, '#22305A', z=-0.03, r=0.236, buckle='#E8B33A', width=0.45)
    # satchel on the character's left hip, strap over the right shoulder
    bag = M('satchel', '#9A5A2E', rough=0.6)
    g.mesh_obj('strap', g.bm_ring(0.222, 0.016, seg=64, segr=8, sy=0.86, rz=1.6), bag, rig.j['spine'],
               loc=(0, 0, 0.19), rot=(0, -40, 0))
    g.mesh_obj('satchel', g.bm_box(0.09, 0.22, 0.18, bevel=0.03), bag, rig.j['spine'], loc=(0.265, -0.02, -0.02),
               rot=(0, -8, 0))
    g.mesh_obj('satchel_flap', g.bm_box(0.096, 0.226, 0.07, bevel=0.018), M('satchel_d', '#7A4422', rough=0.6),
               rig.j['spine'], loc=(0.272, -0.02, 0.055), rot=(0, -8, 0))
    g.mesh_obj('satchel_clasp', g.bm_box(0.012, 0.04, 0.03, bevel=0.005), brass, rig.j['spine'],
               loc=(0.322, -0.02, 0.04), rot=(0, -8, 0))
    env = M('envelope', '#FBF8F0', rough=0.6, emission='#FFFFFF', emission_strength=0.06)
    for k, (dy, tl) in enumerate(((-0.06, -8), (0.04, 10))):
        g.mesh_obj('envelope', g.bm_box(0.012, 0.11, 0.075, bevel=0.003), env, rig.j['spine'],
                   loc=(0.262, -0.02 + dy, 0.11 + 0.01 * k), rot=(tl, -8, 0))
    g.mesh_obj('env_seal', g.bm_ellipsoid(0.008, 0.016, 0.016, 8, 6), M('seal', '#D23A32', rough=0.5),
               rig.j['spine'], loc=(0.255, -0.08, 0.12))


def dress_doctor(rig, spec):
    """의사 선생님: low bun, round glasses, sweater + scarf under a long white coat,
    stethoscope round the neck."""
    hair = spec['hair']
    hm = M('hair', hair, rough=0.42)
    cb.hair_shell(rig, hair, fringe=0.36, wave=0.04, waves=8.0, sweep=-0.18, back_low=-0.42, top_puff=0.07)
    ho(rig, 'bun', vd.fuzz(g.bm_ellipsoid(0.11, 0.095, 0.10, 20, 12), 0.005, 30.0), hm, loc=(0, 0.27, -0.08))
    ho(rig, 'bun_band', g.bm_ring(0.075, 0.015, seg=24, segr=6), M('scrunchie', '#3E9A9A', rough=0.7),
       loc=(0, 0.21, -0.07), rot=(-75, 0, 0))
    vd.round_glasses(rig, '#5A4A6A', r=0.072)
    coat = M('labcoat', '#F7F7F4', rough=0.7, emission='#FFFFFF', emission_strength=0.04)
    g.mesh_obj('labcoat', cb.vest_lathe([(0.278, -0.22), (0.262, -0.10), (0.240, 0.02), (0.222, 0.14),
                                         (0.214, 0.24), (0.200, 0.31), (0.160, 0.39)], gap_deg=26, seg=44, sy=0.88),
               coat, rig.j['spine'])
    for s in (-1, 1):
        g.mesh_obj('lapel', vd.sector_lathe([(0.232, 0.14), (0.224, 0.24), (0.210, 0.31), (0.172, 0.38)],
                                            keep_deg=9, sy=0.88, center_deg=s * 33), coat, rig.j['spine'])
        g.mesh_obj('coat_pocket', g.bm_box(0.08, 0.014, 0.075, bevel=0.008), M('coat_pocket', '#E8ECEE', rough=0.7),
                   rig.j['spine'], loc=(s * 0.165, -0.190, -0.06), rot=(0, 0, s * 26))
    g.mesh_obj('pen', g.bm_cyl(0.008, 0.008, 0.06, seg=8), M('pen', '#3D7CC9', rough=0.3), rig.j['spine'],
               loc=(-0.135, -0.172, 0.21))
    vd.scarf_ring(rig, '#A8324A', stripe=None, R=0.132, r=0.062, dz=0.11)
    vd.striped_tail(rig, rig.j['chest'], [(-0.07, -0.15, 0.10), (-0.085, -0.20, 0.0), (-0.09, -0.22, -0.12)],
                    0.042, ['#A8324A', '#A8324A', '#E8C25A'], seg_len=0.04)
    # stethoscope: tube round the neck over the scarf, two ends down the front
    st = M('stetho', '#5A6070', rough=0.4)
    ring = [(math.sin(a) * 0.150, 0.015 - math.cos(a) * 0.140 * 0.92, 0.190 + 0.02 * math.cos(a))
            for a in [PI * 0.30 + (TAU - PI * 0.6) * k / 24 for k in range(25)]]
    g.mesh_obj('stetho_ring', g.bm_tube_path(ring, 0.011, segr=8), st, rig.j['chest'])
    for s in (-1, 1):
        a = PI * 0.30 if s > 0 else -PI * 0.30
        p0 = (math.sin(a) * 0.150, 0.015 - math.cos(a) * 0.140 * 0.92, 0.190 + 0.02 * math.cos(a))
        end = (s * 0.05, -0.20, -0.04) if s > 0 else (s * 0.095, -0.19, 0.03)
        g.mesh_obj('stetho_tube', g.bm_tube_path(vd.catmull3([p0, (p0[0] * 0.8, -0.175, 0.07), end], 10), 0.010,
                                                 segr=8), st, rig.j['chest'])
    g.mesh_obj('stetho_bell', g.bm_cyl(0.030, 0.030, 0.016, seg=16, centered=True),
               M('stetho_metal', '#D7DFE8', rough=0.2, metal=0.8), rig.j['chest'], loc=(0.05, -0.205, -0.06),
               rot=(80, 0, 0))
    for n in ('R', 'L'):
        g.mesh_obj('coat_cuff', g.bm_ring(0.068, 0.014, seg=24, segr=8), coat, rig.j['el_' + n],
                   loc=(0, 0, -cb.FOREARM + 0.022))


def dress_painter(rig, spec):
    """화가: messy tied-up hair with a pencil, paint-splattered smock, big bow,
    paint smudge; palette + brush come and go per anim."""
    hair = spec['hair']
    hm = M('hair', hair, rough=0.45)
    cb.hair_shell(rig, hair, fringe=0.34, wave=0.11, waves=9.0, sweep=0.12, back_low=-0.40, top_puff=0.08)
    ho(rig, 'topknot', vd.fuzz(g.bm_ellipsoid(0.13, 0.12, 0.11, 20, 12), 0.014, 26.0, seed=1.7), hm,
       loc=(0.02, 0.10, 0.33), rot=(0, 18, 0))
    ho(rig, 'knot_band', g.bm_ring(0.085, 0.017, seg=24, segr=6), M('scrunchie', '#F2C230', rough=0.7),
       loc=(0.01, 0.09, 0.27), rot=(-20, 10, 0))
    ho(rig, 'pencil', g.bm_lathe([(0.0, -0.13), (0.011, -0.13), (0.011, 0.10), (0.0, 0.135)], seg=6),
       M('pencil', '#F2C230', rough=0.5), loc=(0.02, 0.10, 0.36), rot=(0, 70, 20))
    for az, el, tl in ((0.75, 0.15, 150), (-0.85, 0.12, 150), (2.4, 0.2, 120), (-2.5, 0.1, 120), (0.35, 0.55, -40),
                       (-0.45, 0.50, -40), (PI, -0.25, 150)):
        cb.hair_tuft(rig, hair, az, el, size=(0.045, 0.03, 0.10), tilt=(tl, 0, 0), name='stray')
    navy = M('bow_navy', '#2E4A7A', rough=0.6)
    for s in (-1, 1):
        g.mesh_obj('neck_bow', g.bm_ellipsoid(0.065, 0.026, 0.045, 14, 8), navy, rig.j['chest'],
                   loc=(s * 0.060, -0.150, 0.055), rot=(0, s * -16, 0))
        g.mesh_obj('neck_bow_tail', g.bm_box(0.035, 0.014, 0.10, bevel=0.007), navy, rig.j['chest'],
                   loc=(s * 0.03, -0.162, -0.02), rot=(0, s * 18, 0))
    g.mesh_obj('neck_bow_k', g.bm_ellipsoid(0.024, 0.022, 0.024, 10, 6), navy, rig.j['chest'], loc=(0, -0.160, 0.055))
    for s in (-1, 1):
        g.mesh_obj('smock_pocket', g.bm_box(0.09, 0.014, 0.08, bevel=0.01), M('smock_pocket', '#E3D9C2', rough=0.9),
                   rig.j['spine'], loc=(s * 0.15, -0.205, -0.06), rot=(0, 0, s * 24))
    face_obj(rig, 'paint_smudge', vf.bm_blob(vf.lumpy(-0.175, -0.050, 0.024, n=16, k=4, amp=0.35, seed=0.6),
                                             thick=0.004, out=0.0), M('smudge_blue', '#5B9BE0', rough=0.6))
    face_obj(rig, 'paint_smudge2', vf.bm_blob(vf.lumpy(0.20, 0.06, 0.013, n=12, k=3, amp=0.3, seed=1.6),
                                              thick=0.004, out=0.0), M('smudge_yel', '#F2C230', rough=0.6))
    make_palette(rig)


def dress_guard(rig, spec):
    """경비대장: steel helmet with a fur rim + red plume, quilted gambeson vest with
    leather pauldrons, emblem, spear upright in the left fist."""
    hair = spec['hair']
    cb.hair_shell(rig, hair, fringe=0.22, wave=0.05, waves=10.0, sweep=0.0, back_low=-0.45)
    steel = M('helmet', '#AEB9C6', rough=0.30, metal=0.65)
    cb.cap_shell(rig, steel, lambda x, y: 0.30 - 0.10 * y, base=1.16, puff=0.20, name='helmet', soft=0.02)
    fur = M('helmet_fur', '#8A6A4A', rough=0.97)
    cb.tilted_ring(rig, 'helmet_fur', fur, HEAD_R[0] * 1.12, 0.062, 0.38, 0.12, sy=1.0, tufts=12, bump=0.40,
                   seed=6.0)
    ho(rig, 'helmet_ridge', g.bm_tube_path([cb.head_point(0, el, out=0.075)[0] for el in (0.55, 0.85, 1.20, 1.55,
                                                                                          1.85, 2.15)],
                                           0.018, segr=8), M('helmet_d', '#8A96A6', rough=0.3, metal=0.65))
    ho(rig, 'helmet_knob', g.bm_ellipsoid(0.035, 0.035, 0.035, 12, 8), M('brass', '#E8B33A', rough=0.3, metal=0.7),
       loc=(0, 0.0, 0.405))
    plume = g.bm_lathe([(0.0, 0.0), (0.045, 0.03), (0.055, 0.09), (0.030, 0.15), (0.0, 0.17)], seg=14, smooth_n=10)
    vd.fuzz(plume, 0.007, 50.0)
    ho(rig, 'plume', plume, M('plume', '#D23A32', rough=0.9), loc=(0, 0.03, 0.42), rot=(-25, 0, 0))
    # gambeson is the quilted torso; leather pauldrons + belt + emblem
    leather = M('pauldron', '#8A5A33', rough=0.55)
    for n, s in (('R', -1), ('L', 1)):
        g.mesh_obj('pauldron', g.bm_ellipsoid(0.105, 0.105, 0.075, 18, 10), leather, rig.j['sh_' + n],
                   loc=(0.0, 0.0, 0.035))
        g.mesh_obj('pauldron_rim', g.bm_ring(0.090, 0.014, seg=28, segr=6), M('brass', '#E8B33A', rough=0.3, metal=0.7),
                   rig.j['sh_' + n], loc=(0.0, 0.0, 0.0))
    cb.belt(rig, '#5A3A22', z=0.02, r=0.262, buckle='#E8B33A', width=0.55)
    g.mesh_obj('emblem', g.bm_cyl(0.045, 0.045, 0.014, seg=24, centered=True), M('brass', '#E8B33A', rough=0.3,
                                                                                    metal=0.7),
               rig.j['spine'], loc=(0, -0.205, 0.22), rot=(82, 0, 0))
    g.mesh_obj('emblem_in', g.bm_cyl(0.026, 0.026, 0.016, seg=6, centered=True), M('emblem_in', '#2E4A7A', rough=0.5),
               rig.j['spine'], loc=(0, -0.212, 0.222), rot=(82, 0, 0))
    g.mesh_obj('collar', g.bm_ring(0.14, 0.052, seg=48, segr=10, sy=0.92, rz=1.2, tufts=10, bump=0.35, seed=2.0),
               fur, rig.j['chest'], loc=(0, 0.01, 0.10))
    make_spear(rig)


def dress_skater(rig, spec):
    """스케이트 소녀: knit ear-flap hat with pompom and braids, sky-blue skating dress
    with white fluff trim, white tights, ice skates."""
    hair = spec['hair']
    hm = M('hair', hair, rough=0.42)
    cb.hair_shell(rig, hair, fringe=0.32, wave=0.08, waves=12.0, sweep=0.0, back_low=-0.58, top_puff=0.05)
    knit = M('hat_knit', '#F4F1EA', rough=0.95)
    blue = M('hat_blue', '#5BB6E8', rough=0.95)
    cb.cap_shell(rig, knit, lambda x, y: 0.24 - 0.20 * y, base=1.13, puff=0.24, name='hat', lumps=0.03)
    cb.tilted_ring(rig, 'hat_band', blue, HEAD_R[0] * 1.075, 0.040, 0.48, 0.08, sy=0.97, rz=1.1)
    vd.pompom(rig, '#5BB6E8', (0.0, 0.02, 0.405), r=0.085)
    for s in (-1, 1):
        ho(rig, 'earflap', g.bm_ellipsoid(0.06, 0.12, 0.14, 16, 10), knit, loc=(s * 0.300, 0.03, -0.08),
           rot=(0, s * 14, 0))
        ho(rig, 'earflap_trim', g.bm_ellipsoid(0.064, 0.123, 0.040, 16, 8), blue, loc=(s * 0.302, 0.03, -0.16),
           rot=(0, s * 14, 0))
        pts = [(s * 0.31, 0.03, -0.20), (s * 0.31, 0.02, -0.28), (s * 0.30, 0.0, -0.36)]
        ho(rig, 'flap_string', g.bm_tube_path(pts, 0.012, segr=6), blue)
        ho(rig, 'flap_tassel', g.bm_ellipsoid(0.026, 0.026, 0.030, 10, 6), blue, loc=(s * 0.30, 0.0, -0.385))
        # braids peeking out behind the flaps
        bp = [(s * 0.24, 0.17, -0.12), (s * 0.25, 0.18, -0.24), (s * 0.24, 0.17, -0.34)]
        for k, p in enumerate(bp):
            ho(rig, 'braid', g.bm_ellipsoid(0.042 - 0.004 * k, 0.040, 0.050, 12, 8), hm, loc=p)
    # skirt frill + snowflake on the chest
    cb.collar_fur(rig, spec, R=0.13, r=0.060, dz=0.10, bump=0.35, tufts=9)
    g.mesh_obj('skirt_frill', g.bm_ring(spec['hem_r'] - 0.01, 0.030, seg=72, segr=8, sy=0.84, rz=0.8, tufts=18,
                                        bump=0.25, seed=2.0), M('frill', '#A8DCF8', rough=0.8), rig.j['spine'],
               loc=(0, 0, spec['hem_z'] + 0.045))
    flake = M('flake', '#FFFFFF', rough=0.4, emission='#FFFFFF', emission_strength=0.5)
    for k in range(3):
        a = PI * k / 3
        g.mesh_obj('flake', g.bm_box(0.010, 0.010, 0.075, bevel=0.003), flake, rig.j['spine'],
                   loc=(0.0, -0.188, 0.20), rot=(10, a * 180 / PI, 0))
    cb.belt(rig, '#3D8AC9', z=0.08, r=0.205, buckle=None, width=0.40)
    make_skates(rig)


def dress_toddler(rig, spec):
    """아기 콩콩: snowman onesuit - puffy white hood with a tiny top hat, coal
    buttons, red striped scarf, red mittens; a wisp of hair under the hood."""
    white = spec['coat_mat']
    rim = M('hood_rim', '#FFFFFF', rough=0.95)
    snow_hood(rig, white, rim, scale=1.16)
    hair = spec['hair']
    for az, tl in ((-0.25, -75), (0.05, -80), (0.30, -72)):
        cb.hair_tuft(rig, hair, az, 0.36, size=(0.055, 0.035, 0.085), tilt=(tl, 0, 0), name='wisp')
    # tiny black top hat perched on the hood (snowman!)
    hat = M('tophat', '#2A2630', rough=0.45)
    ho(rig, 'tophat_brim', g.bm_lathe([(0.0, 0.0), (0.17, 0.0), (0.175, 0.012), (0.0, 0.018)], seg=32), hat,
       loc=(0.03, 0.03, 0.315), rot=(-8, 12, 0))
    ho(rig, 'tophat_crown', g.bm_lathe([(0.11, 0.0), (0.105, 0.14), (0.112, 0.15), (0.0, 0.152)], seg=28,
                                       cap_bottom=False), hat, loc=(0.035, 0.03, 0.320), rot=(-8, 12, 0))
    ho(rig, 'tophat_band', g.bm_ring(0.108, 0.020, seg=28, segr=6, rz=1.2), M('tophat_band', '#E04848', rough=0.6),
       loc=(0.037, 0.03, 0.345), rot=(-8, 12, 0))
    # coal buttons + carrot-orange zip pull
    coal = M('coal', '#2A2630', rough=0.5)
    prof = spec.get('torso_profile_raw') or STD
    for z in (0.02, 0.13, 0.24):
        g.mesh_obj('coal', g.bm_ellipsoid(0.032, 0.022, 0.032, 12, 8), coal, rig.j['spine'],
                   loc=torso_pt(0, z, out=0.022, prof=prof, sy=spec.get('torso_sy', 0.84)))
    vd.scarf_ring(rig, '#E04848', stripe='#FFFFFF', R=0.135, r=0.070, dz=0.10)
    vd.striped_tail(rig, rig.j['chest'], [(0.07, -0.16, 0.08), (0.09, -0.205, 0.0), (0.10, -0.22, -0.08)], 0.050,
                    ['#E04848', '#FFFFFF'], seg_len=0.04, thick=0.045)
    # mitten strings / cuffs
    for n in ('R', 'L'):
        g.mesh_obj('mitt_cuff', g.bm_ring(0.052, 0.020, seg=24, segr=8), M('mitt_cuff', '#FFFFFF', rough=0.95),
                   rig.j['hand_' + n], loc=(0, 0, 0.045))


DRESS = {
    'npc_clerk_a': dress_clerk_a, 'npc_clerk_b': dress_clerk_b, 'npc_porter_a': dress_porter_a,
    'npc_porter_b': dress_porter_b, 'npc_captain': dress_captain, 'npc_chef': dress_chef,
    'npc_postman': dress_postman, 'npc_doctor': dress_doctor, 'npc_painter': dress_painter,
    'npc_guard': dress_guard, 'npc_skater': dress_skater, 'npc_toddler': dress_toddler,
}
