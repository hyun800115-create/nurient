"""
pet2_maltipoo.py - 누리 (Nuri), the village dog: a small Maltipoo (Maltese x toy poodle) modelled on the
designer's own dog.  Light-brown (soft caramel / apricot) wavy-curly coat, a white patch on the chest,
small white "socks" on both FRONT paws, a round fluffy face with dark button eyes and a small black nose,
long floppy furry ears, a plumed tail carried over the back.  No scarf.

It REPLACES the batch-1 shiba (vil_pets.build_dog) for the pet_dog character only.  vil_pets.build_dog is
left untouched (the dog sled huskies in veh_lib still use it).

Contract with the existing dog pipeline (pet2_build / pet2_anim / vil_anim / pet2_render):
  * the SAME skeleton as vil_pets.build_dog: joint names AND rest positions (root, body, neck, head,
    ear_R/L, tail, leg_FR/FL/BR/BL, knee_*), the same PET_SCALE 1.28 and shadow.  All poses therefore work
    unchanged, and every manifest point (mouthPoint, treatPoint, bellyPoint, catch impactPoint) - which is a
    joint position - comes out identical;
  * the same face toggles: p_eye_dot, p_eye_blink, p_eye_happy, p_m_closed, p_m_open (= [m_open, tongue],
    pet2_build takes [0] for p_m_wide);
  * the muzzle front stays at y ~ -0.167 (head-local) so the ball / biscuit joints of pet2_build sit in the
    mouth exactly as before.
The coat is built from smooth ellipsoids / capsules with a deterministic lumpy displacement (vil_dress.fuzz,
higher frequency than the knit) and a curly-fur material (Voronoi curls -> bump + a slightly darker colour in
the hollows), so the silhouette reads soft and wavy at phone zoom and the curls show up close.
Not run directly: pet2_build.build() calls build().
"""
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

import bpy                                   # noqa: E402
from mathutils import Vector, Quaternion     # noqa: E402

import bl_common as bc                       # noqa: E402
import char_geo as g                         # noqa: E402
import vil_face as vf                        # noqa: E402
from vil_dress import fuzz, catmull3         # noqa: E402
from vil_pets import pet_eyes, blush, decal, PET_SCALE   # noqa: E402

PI = math.pi
TAU = math.tau

# palette (sRGB).  연한 갈색 = soft caramel / apricot: warm but not orange, light but not cream.
COAT = '#D8A878'          # the light-brown coat
COAT_DARK = '#B98556'     # curl hollows (material only)
EAR = '#C99467'           # the ears a touch deeper, as on most apricot maltipoos
EAR_DARK = '#A8754A'
MUZZLE = '#E6C6A2'        # a lighter muzzle so the nose and mouth read
BELLY = '#EBD3B6'         # pale belly (shows in roll)
WHITE = '#FBF8F2'         # chest patch + front socks
WHITE_DARK = '#E2DBD0'
NOSE = '#231C1E'
PINK = '#F2A3A3'          # paw pads / inner ear


def M(name, color, rough=0.75, **kw):
    return bc.mat(name, color, rough=rough, **kw)


_FUR = {}


def mat_fur(name, base, dark, scale=44.0, bump=0.24, rough=0.88):
    """Curly coat: Voronoi cells in object space (they move with the part, no swimming) -> a bump for the
    curls and a slightly darker colour in the hollows between them."""
    key = (name, base, dark, scale, bump)
    if key in _FUR:
        return _FUR[key]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    p = nt.nodes.get('Principled BSDF')
    p.inputs['Roughness'].default_value = rough
    tc = nt.nodes.new('ShaderNodeTexCoord')
    vo = nt.nodes.new('ShaderNodeTexVoronoi')
    vo.feature = 'SMOOTH_F1'
    vo.inputs['Scale'].default_value = scale
    if 'Smoothness' in vo.inputs:
        vo.inputs['Smoothness'].default_value = 0.6
    if 'Randomness' in vo.inputs:
        vo.inputs['Randomness'].default_value = 0.85
    nt.links.new(tc.outputs['Object'], vo.inputs['Vector'])
    # distance 0 at a curl centre .. ~0.5 between curls
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    cr = ramp.color_ramp
    cr.elements[0].position = 0.25
    cr.elements[0].color = (*bc.srgb_to_linear(base), 1)
    cr.elements[1].position = 0.80
    cr.elements[1].color = (*bc.srgb_to_linear(dark), 1)
    nt.links.new(vo.outputs['Distance'], ramp.inputs['Fac'])
    nt.links.new(ramp.outputs['Color'], p.inputs['Base Color'])
    inv = nt.nodes.new('ShaderNodeMath')
    inv.operation = 'SUBTRACT'
    inv.inputs[0].default_value = 1.0
    nt.links.new(vo.outputs['Distance'], inv.inputs[1])
    bp = nt.nodes.new('ShaderNodeBump')
    bp.inputs['Strength'].default_value = bump
    bp.inputs['Distance'].default_value = 0.02
    nt.links.new(inv.outputs[0], bp.inputs['Height'])
    nt.links.new(bp.outputs['Normal'], p.inputs['Normal'])
    if 'Sheen Weight' in p.inputs:                       # a soft fuzzy rim
        p.inputs['Sheen Weight'].default_value = 0.35
        p.inputs['Sheen Roughness'].default_value = 0.6
    _FUR[key] = m
    return m


def fluffy(rx, ry, rz, amp=0.006, f=64.0, seed=0.0, seg=40, rings=22):
    """A curly-coat ellipsoid: dense enough for the lumpy displacement to show in the silhouette."""
    return fuzz(g.bm_ellipsoid(rx, ry, rz, seg, rings), amp=amp, f=f, seed=seed)


def fluffy_capsule(r, length, r_end=None, amp=0.005, f=70.0, seed=0.0):
    return fuzz(g.bm_capsule(r, length, r_end=r_end, seg=28, rings=12), amp=amp, f=f, seed=seed)


def build_maltipoo():
    _FUR.clear()              # bc.reset_scene() removed the materials of an earlier build in this process
    rig = g.Rig('animal')
    rig.add('root', None, (0, 0, 0))
    rig.add('body', 'root', (0, 0, 0.215))                    # = vil_pets.build_dog
    coat = mat_fur('nuri_coat', COAT, COAT_DARK)
    coat_s = mat_fur('nuri_coat_s', COAT, COAT_DARK, scale=60.0, bump=0.2)   # finer curls on the face / legs
    earm = mat_fur('nuri_ear', EAR, EAR_DARK, scale=50.0, bump=0.3)
    white = mat_fur('nuri_white', WHITE, WHITE_DARK, scale=52.0, bump=0.22)
    muzzle = mat_fur('nuri_muzzle', MUZZLE, COAT, scale=80.0, bump=0.12)
    belly = mat_fur('nuri_belly', BELLY, COAT, scale=52.0, bump=0.2)
    body = rig.j['body']
    # --- body: round, fluffy; the white chest patch sits on the front between the front legs
    g.mesh_obj('body', fluffy(0.142, 0.205, 0.132, amp=0.007, seed=0.3), coat, body, loc=(0, 0.02, 0))
    g.mesh_obj('belly', fluffy(0.106, 0.160, 0.090, amp=0.006, f=66.0, seed=0.9), belly, body, loc=(0, 0.01, -0.056))
    g.mesh_obj('chest', fluffy(0.088, 0.078, 0.104, amp=0.006, f=70.0, seed=1.1), white, body,
               loc=(0, -0.170, -0.010))
    g.mesh_obj('chest_lo', fluffy(0.060, 0.056, 0.060, amp=0.005, f=74.0, seed=1.7), white, body,
               loc=(0, -0.176, -0.085))
    # --- neck ruff (coat) with the top of the white bib showing under the chin
    rig.add('neck', 'body', (0, -0.15, 0.07))
    neck = rig.j['neck']
    g.mesh_obj('ruff', fluffy(0.112, 0.092, 0.100, amp=0.007, f=60.0, seed=2.3), coat, neck, loc=(0, 0.01, 0.03))
    g.mesh_obj('bib', fluffy(0.058, 0.048, 0.066, amp=0.005, f=74.0, seed=2.9), white, neck,
               loc=(0, -0.066, -0.040))
    # --- head: same head ellipsoid as the shiba (face decals use its radii), a round fluffy top,
    #     fluffy cheeks, a short soft muzzle, small black nose, dark button eyes
    rig.add('head', 'neck', (0, -0.04, 0.13))
    head = rig.j['head']
    hc, hr = Vector((0, 0, 0.0)), (0.150, 0.135, 0.128)
    g.mesh_obj('head', g.bm_ellipsoid(*hr, 32, 16), coat_s, head, loc=tuple(hc))
    g.mesh_obj('topknot', fluffy(0.116, 0.102, 0.070, amp=0.008, f=58.0, seed=3.7), coat, head,
               loc=(0, 0.024, 0.080))
    g.mesh_obj('crown_back', fluffy(0.128, 0.10, 0.10, amp=0.007, f=60.0, seed=4.1), coat, head,
               loc=(0, 0.05, 0.0))
    for s in (-1, 1):
        g.mesh_obj('cheek', fluffy(0.062, 0.055, 0.056, amp=0.005, f=80.0, seed=5.0 + s), coat_s, head,
                   loc=(s * 0.095, -0.072, -0.062))
    mz_c, mz_r = Vector((0, -0.116, -0.046)), (0.064, 0.058, 0.049)
    g.mesh_obj('muzzle', g.bm_ellipsoid(*mz_r, 22, 12), muzzle, head, loc=tuple(mz_c))
    g.mesh_obj('chin', fluffy(0.044, 0.036, 0.030, amp=0.004, f=90.0, seed=6.2), muzzle, head,
               loc=(0, -0.120, -0.083))
    g.mesh_obj('nose', g.bm_ellipsoid(0.026, 0.018, 0.019, 14, 8), M('nuri_nose', NOSE, rough=0.28), head,
               loc=(0, -0.170, -0.017))
    pet_eyes(rig, head, hc, hr, eu=0.060, ev=0.016, ew=0.028, eh=0.033)
    blush(head, hc, hr, u=0.100, v=-0.040)
    mouth = M('mouth_line', '#5A2A2A', rough=0.5)
    closed = decal(head, 'm_w', vf.bm_stroke([(-0.028, -0.008), (-0.013, -0.024), (0.0, -0.013), (0.013, -0.024),
                                              (0.028, -0.008)], 0.0055, thick=0.008, taper=0.6, radii=mz_r),
                   mouth, mz_c)
    opn = [decal(head, 'm_open', vf.bm_blob(vf.ellipse(0, -0.020, 0.028, 0.022, 18), thick=0.008, radii=mz_r),
                 M('mouth_in', '#6E2430', rough=0.5), mz_c),
           decal(head, 'tongue', vf.bm_blob(vf.ellipse(0, -0.040, 0.018, 0.022, 14), thick=0.012, out=0.004,
                                            radii=mz_r), M('tongue', '#EE7F86', rough=0.5), mz_c)]
    rig.toggle('p_m_closed', [closed])
    rig.toggle('p_m_open', opn)
    # --- long floppy furry ears hanging beside the face (joints at the shiba ear joints, so the ear
    #     flaps of every pose still work: pitch swings them forward / back)
    for nm, s in (('R', -1), ('L', 1)):
        jl = Vector((s * 0.085, 0.01, 0.085))
        rig.add('ear_' + nm, 'head', tuple(jl), side=1 if nm == 'R' else -1)
        ej = rig.j['ear_' + nm]
        c = Vector((s * 0.142, 0.004, -0.012)) - jl                     # head-local centre -> joint-local
        q = Quaternion((0, 1, 0), math.radians(-s * 9)) @ Quaternion((1, 0, 0), math.radians(-6))
        g.mesh_obj('ear', fluffy(0.036, 0.062, 0.098, amp=0.007, f=62.0, seed=7.0 + s), earm, ej,
                   loc=tuple(c), rot=q)
        g.mesh_obj('ear_tip', fluffy(0.034, 0.054, 0.040, amp=0.007, f=60.0, seed=7.5 + s), earm, ej,
                   loc=tuple(c + Vector((s * 0.012, -0.004, -0.078))), rot=q)
    # --- plumed tail carried up over the back
    rig.add('tail', 'body', (0, 0.19, 0.07))
    # low over the back (not up like the shiba's curl): from the front (S) it stays hidden behind the head
    # instead of poking above it like a pompom; from the side it is the plume over the back
    pts = catmull3([(0, 0.0, 0.0), (0, 0.022, 0.045), (0, -0.015, 0.078), (0, -0.065, 0.084),
                    (0, -0.105, 0.072)], 22)
    g.mesh_obj('tail', fuzz(g.bm_tube_path(pts, lambda t: 0.030 + 0.024 * math.sin(PI * min(1.0, t * 1.15)),
                                           segr=16), amp=0.008, f=58.0, seed=8.3), coat, rig.j['tail'])
    g.mesh_obj('tail_tip', fluffy(0.036, 0.044, 0.030, amp=0.007, f=62.0, seed=8.9), coat, rig.j['tail'],
               loc=tuple(pts[-1]))
    # --- fluffy legs; the FRONT paws wear white socks (paw + the lower shin), the back paws are coat
    upper, lower = 0.075, 0.095
    r_up, r_low, paw_r = 0.050, 0.040, 0.038
    pads = M('nuri_pads', PINK, rough=0.7)
    for name, pos in {'FR': (-0.075, -0.12, -0.06), 'FL': (0.075, -0.12, -0.06),
                      'BR': (-0.075, 0.12, -0.05), 'BL': (0.075, 0.12, -0.05)}.items():
        front = name[0] == 'F'
        rig.add('leg_' + name, 'body', pos)
        rig.add('knee_' + name, 'leg_' + name, (0, 0, -upper))
        ru = r_up * (1.0 if front else 1.12)
        g.mesh_obj('thigh_' + name, fluffy_capsule(ru, upper, r_end=ru * 0.86, seed=9.0 + len(name)), coat,
                   rig.j['leg_' + name])
        g.mesh_obj('shin_' + name, fluffy_capsule(r_low, lower - paw_r * 0.6, r_end=r_low * 0.95, seed=9.7),
                   coat_s, rig.j['knee_' + name])
        paw_m = white if front else coat_s
        if front:
            # the sock: a white fluffy cuff round the lower shin, a little proud of the coat so it reads
            g.mesh_obj('sock_' + name, fluffy_capsule(r_low * 1.12, lower * 0.40 - paw_r * 0.3,
                                                      r_end=r_low * 1.10, amp=0.004, seed=10.3),
                       white, rig.j['knee_' + name], loc=(0, -0.002, -lower * 0.48))
        g.mesh_obj('paw_' + name, fuzz(g.bm_ellipsoid(paw_r * 1.12, paw_r * 1.35, paw_r * 0.82, 18, 10),
                                       amp=0.003, f=90.0, seed=11.0),
                   paw_m, rig.j['knee_' + name], loc=(0, -paw_r * 0.35, -lower + paw_r * 0.75))
        g.mesh_obj('pad_' + name, g.bm_ellipsoid(paw_r * 0.62, paw_r * 0.7, paw_r * 0.18, 12, 6), pads,
                   rig.j['knee_' + name], loc=(0, -paw_r * 0.25, -lower + paw_r * 0.02))
    rig.meta['shadow'] = [42, 18]                              # = vil_pets.build_dog
    return rig


def build():
    """pet_dog = 누리 the maltipoo, uniformly sized up like every village pet (vil_pets.PET_SCALE)."""
    rig = build_maltipoo()
    s = PET_SCALE['pet_dog']
    top = g.empty('pet_scale', None, (0, 0, 0))
    top.scale = (s, s, s)
    rig.j['root'].parent = top
    rig.meta['scale'] = s
    rig.meta['shadow'] = [round(v * s) for v in rig.meta['shadow']]
    return rig
