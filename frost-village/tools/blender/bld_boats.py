"""
bld_boats.py - the v3 boats (docs/CONTRACT_V3.md section E): characters-style atlases with the crew baked in.

  boat_rowboat   ~2.5 m rowboat (red / cream / blue hull like the props boat_small) with the fisherman
                 (char_build 'fisherman', yellow raincoat) rowing.  anims: idle 2f, row 6f loop.
  boat_fishing   ~4.5 m fishing boat: white hull, small wheelhouse with a red roof, net boom; crew of 2
                 (a captain at the wheel + the fisherman on deck).  anims: idle 2f, sail 4f loop.

Frames: <cache>/<key>/<anim>_<dir>_<i>.png for dirs S, SE, E, NE, N (SW/W/NW = flipX in game), one fixed
frame size per boat with the anchor = waterline centre of the hull (world origin, z = 0).  NO baked shadow.
The waterline is a holdout plane at z = 0: everything below the water is cut out of the sprite, so the hull
shows more or less of itself as the boat bobs and the oar blades really dip into the water.
meta.json: frameSize, anchor, anims, cargoPoint[dir] = [dx, dy, behind] (bottom of a carried fish stack in
the boat, like a character's carryPoint), wakePoint[dir] (stern at the waterline, for fx_wake),
bowPoint[dir], headTop.

The crew rigs are built with char_build.build_human + the dress functions (read-only reuse, the same
bodies as assets/characters).  Rendered by bld_render.py (keys boat_rowboat, boat_fishing).
"""
import json
import math
import os
import time
from collections import OrderedDict

import bpy
from mathutils import Vector, Matrix, Euler

import bl_common as bc
import prop_lib as L
from prop_lib import C, flat, box, cyl, sphere, blob, extrude
import prop_assets as PA
import char_build as CB
import char_geo as G

BOATS = OrderedDict()
DIRS = ['S', 'SE', 'E', 'NE', 'N']


def boat(key, anims, frame, anchor, samples=28, notes=''):
    def deco(fn):
        BOATS[key] = dict(key=key, fn=fn, anims=anims, frame=frame, anchor=anchor, samples=samples, notes=notes)
        return fn
    return deco


# =========================================================================== shared parts

def hull_mat(name, bands):
    """Hull colour bands by object-space Z: bands = [(z_from, colour), ...] ascending; inside (back faces) is
    planked wood."""
    nb = L.NB(name, rough=0.55)
    tc = nb.n('ShaderNodeTexCoord')
    sep = nb.n('ShaderNodeSeparateXYZ')
    nb.link(tc.outputs['Object'], sep.inputs[0])
    col = C(bands[0][1])
    out = None
    for z, c in bands[1:]:
        f = nb.map_range(sep.outputs['Z'], z - 0.012, z + 0.012)
        out = nb.mix_rgb(f, out if out is not None else col, C(c))
    geo = nb.n('ShaderNodeNewGeometry')
    planks = nb.math('FRACT', nb.math('MULTIPLY', sep.outputs['Z'], 9.0))
    pf = nb.map_range(planks, 0.9, 0.95)
    inner = nb.mix_rgb(pf, C('#C08A55'), C('#9A6A3C'))
    out = nb.mix_rgb(geo.outputs['Backfacing'], out, inner)
    nb.base(out)
    return nb.m


def hull_section(L_, beam, rim, depth, bow_k=0.6, stern_k=0.25):
    """(y, z) -> half width of the hull: bow at -Y (pointed), stern at +Y (blunt transom)."""
    def hw(yn, zn):
        # yn in [-1, 1] (bow .. stern), zn in [-1, 0] (keel .. rim)
        if yn < 0:
            k = 1.0 - bow_k * yn * yn
        else:
            k = 1.0 - stern_k * yn * yn
        return beam / 2 * k * math.sqrt(max(0.0, 1.0 - zn * zn))
    return hw


def hull(name, L_, beam, rim, depth, mat, bow_k=0.6, stern_k=0.25, sheer=0.06, M=40, K=10):
    """Open hollow hull (no lid): long axis Y, bow at -Y.  Keel at z = rim - depth.  The sheer line rises
    toward the bow by `sheer` m.  Returns (object, outline points of the rim)."""
    import bmesh
    hw = hull_section(L_, beam, rim, depth, bow_k, stern_k)
    bm = bmesh.new()
    rows = []
    for k in range(K + 1):
        zn = -1.0 + k / K                       # keel .. rim
        row = []
        for j in range(M):
            t = math.tau * j / M
            yn = -math.cos(t)                      # j=0 -> bow
            s = math.sin(t)
            y = yn * L_ / 2 * math.sqrt(max(0.0, 1.0 - (zn * 0.55) ** 2)) * (0.97 if yn > 0 else 1.0)
            x = s * hw(yn, zn)
            rise = sheer * max(0.0, -yn) ** 2 * (k / K)
            z = rim + zn * depth * (1.0 - 0.25 * abs(yn) ** 3) + rise
            row.append(bm.verts.new((x, y, z)))
        rows.append(row)
    for k in range(K):
        for j in range(M):
            j2 = (j + 1) % M
            bm.faces.new((rows[k][j], rows[k][j2], rows[k + 1][j2], rows[k + 1][j]))
    keel = bm.verts.new((0, 0, rim - depth - 0.01))
    for j in range(M):
        bm.faces.new((rows[0][(j + 1) % M], rows[0][j], keel))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    rim_pts = [Vector(v.co) for v in rows[-1]]
    ob = L.finish(name, bm, [mat], smooth=True)
    return ob, rim_pts


def rim_tube(name, pts, r, mat):
    mb = L.MB()
    n = len(pts)
    for i in range(n):
        mb.seg(pts[i], pts[(i + 1) % n], r, mat, segs=8)
    return mb.done(name)


def half_width_at(rim_pts, y):
    """Half width of the rim outline at y (max |x| of the polygon crossing y)."""
    best = 0.0
    n = len(rim_pts)
    for i in range(n):
        a, b = rim_pts[i], rim_pts[(i + 1) % n]
        if (a.y - y) * (b.y - y) <= 0 and abs(b.y - a.y) > 1e-6:
            t = (y - a.y) / (b.y - a.y)
            best = max(best, abs(a.x + (b.x - a.x) * t))
    return best


def oar(name, inboard=0.38, outboard=1.18, r=0.028):
    """Oar along local +X from the pivot (oarlock): handle at -inboard, blade at the +X end."""
    wood = flat('#D9A56A', 0.65)
    dark = flat('#8A5A33', 0.7)
    objs = [cyl(name + '_shaft', r, inboard + outboard - 0.3, (-inboard, 0, 0), rot=(0, 90, 0), mat=wood, segs=10,
                bevel=0.008),
            cyl(name + '_grip', r * 1.25, 0.16, (-inboard - 0.02, 0, 0), rot=(0, 90, 0), mat=dark, segs=10,
                bevel=0.01)]
    bl = box(name + '_blade', (0.4, 0.15, 0.03), (outboard - 0.2, 0, 0), mat=flat('#E8B87A', 0.6), bevel=0.012,
             origin='center')
    objs.append(bl)
    objs.append(box(name + '_tip', (0.06, 0.155, 0.034), (outboard - 0.02, 0, 0), mat=flat('#D9483B', 0.6),
                    bevel=0.01, origin='center'))
    piv = L.group(objs, name)
    return piv


def crew_rig(key='fisherman', spec_over=None, dress=None):
    """A character rig (same body + clothes as assets/characters) WITHOUT resetting the scene."""
    spec = dict(CB.SPECS[key])
    if spec_over:
        spec.update(spec_over)
    spec['coat_mat'] = CB.M('coat_' + key, spec['coat'], rough=spec.get('coat_rough', 0.8)) \
        if spec['coat'] != 'plaid' else CB.mat_plaid('plaid', '#C8402F', '#5E1A17', light='#D65A45', scale=7.0)
    rig = CB.build_human(spec)
    (dress or spec['dress'])(rig, spec)
    rig.meta['key'] = key
    return rig


def dress_captain(rig, spec):
    """Captain: navy pea coat with gold buttons, white captain's cap with a black peak, white beard."""
    gold = CB.M('gold_btn', '#F2C14E', rough=0.3, metal=0.6)
    for z in (0.03, 0.13, 0.23):
        for sx in (-0.07, 0.07):
            G.mesh_obj('btn', G.bm_ellipsoid(0.017, 0.010, 0.017, 10, 6), gold, rig.j['spine'],
                       loc=Vector(CB.front_point(z, 0.212 if z < 0.15 else 0.205)) + Vector((sx, 0.0, 0.0)))
    G.mesh_obj('collar', G.bm_ring(0.150, 0.05, seg=48, segr=12, sy=0.9, rz=1.0), spec['coat_mat'],
               rig.j['chest'], loc=(0, 0.01, 0.09))
    CB.hair_shell(rig, '#E8E4DC', fringe=0.24, wave=0.04, waves=10.0, sweep=0.0, back_low=-0.45)
    CB.beard(rig, '#F2EEE6', edge=-0.30, curve=0.40, base=1.13, chin=0.15)
    white = CB.M('capwhite', '#F4F2EC', rough=0.6)
    navy = CB.M('capnavy', '#2B3550', rough=0.5)
    CB.cap_shell(rig, white, lambda x, y: 0.30 - 0.16 * y, base=1.13, puff=0.05, name='cap_top')
    CB.tilted_ring(rig, 'cap_band', navy, CB.HEAD_R[0] * 1.06, 0.035, 0.36, 0.20, sy=1.0, rz=1.4)
    peak = G.bm_slab([(-0.16, 0.0), (0.16, 0.0), (0.12, -0.13), (-0.12, -0.13)], 0.025, bevel=0.008)
    G.mesh_obj('cap_peak', peak, CB.M('peak', '#1E2230', rough=0.3), rig.j['head'], loc=(0, -0.21, 0.37),
               rot=(-12, 0, 0))
    G.mesh_obj('cap_badge', G.bm_ellipsoid(0.03, 0.01, 0.022, 10, 6), gold, rig.j['head'], loc=(0, -0.288, 0.42))


# =========================================================================== rowboat

ROW_L, ROW_BEAM, ROW_RIM, ROW_DEPTH = 2.5, 1.02, 0.42, 0.62
SEAT_Y, SEAT_Z = 0.22, 0.26
LOCK_Y, LOCK_Z = -0.2, ROW_RIM + 0.06


@boat('boat_rowboat', anims={'idle': {'frames': 2, 'fps': 3, 'repeat': -1},
                             'row': {'frames': 6, 'fps': 9, 'repeat': -1}},
      frame=(200, 168), anchor=(100, 112), samples=28,
      notes='Rowboat (~2.5 m) with the fisherman rowing (facing the bow). idle = drifting with the oars resting, '
            'row = 6-frame stroke loop. Anchor = waterline centre; no baked shadow (draw fx_wake at wakePoint). '
            'cargoPoint = bottom of a fish stack in the stern box, behind=true -> draw the stack before the boat.')
def b_boat_rowboat():
    grp = bpy.data.objects.new('boat', None)
    bpy.context.scene.collection.objects.link(grp)
    parts = []
    hm = hull_mat('rowhull', [(-1.0, '#D9483B'), (0.16, '#F4EFE4'), (0.33, '#3D7CC9')])
    h, rim = hull('hull', ROW_L, ROW_BEAM, ROW_RIM, ROW_DEPTH, hm, bow_k=0.75, stern_k=0.3, sheer=0.1)
    parts.append(h)
    parts.append(rim_tube('gunwale', rim, 0.04, flat('#8A5A33', 0.7)))
    # floor boards + thwarts (seats) + stern box
    fz = 0.1
    fy0, fy1 = -0.85, 0.95
    pts = []
    for k in range(25):
        y = fy0 + (fy1 - fy0) * k / 24
        pts.append((half_width_at(rim, y) * 0.62, y))
    poly = pts + [(-x, y) for x, y in pts[::-1]]
    fl = extrude('floor', poly, 0.03, top=L.stripes('#C99A62', '#B5864F', 9.0, 'X', soft=0.04),
                 side=flat('#A87442', 0.8), bevel=0.0)
    fl.location = (0, 0, fz)
    parts.append(fl)
    seat = flat('#D9A56A', 0.7)
    for y, z in ((SEAT_Y, SEAT_Z), (-0.72, 0.3)):
        w = half_width_at(rim, y) * 2 - 0.06
        parts.append(box('thwart', (w, 0.24, 0.05), (0, y, z), mat=seat, bevel=0.015))
    # stern fish box (cargo spot) with a snow-free lid rim
    by = 0.82
    w = half_width_at(rim, by) * 2 - 0.12
    parts.append(box('fishbox', (min(0.56, w), 0.34, 0.3), (0, by, fz), mat=L.stripes('#C08A55', '#A87442', 4.0, 'Z',
                                                                                       soft=0.04), bevel=0.02))
    parts.append(PA.fish_model('bfish', loc=(0.02, by, fz + 0.33), rot=(0, 0, 70), scale=0.42))
    # oarlocks
    iron = flat('#5A606B', 0.4, 0.6)
    for sx in (-1, 1):
        x = sx * (half_width_at(rim, LOCK_Y) + 0.0)
        parts.append(cyl('lock', 0.035, 0.1, (x, LOCK_Y, LOCK_Z - 0.06), mat=iron, segs=10))
    # bow ring + a little lantern on the bow post
    parts.append(cyl('bowpost', 0.04, 0.22, (0, -ROW_L / 2 + 0.12, ROW_RIM + 0.08), mat=flat('#8A5A33', 0.7), segs=10))
    for o in parts:
        if o.parent is None:
            o.parent = grp
    # oars (pivots at the oarlocks)
    oars = []
    for sx in (-1, 1):
        x = sx * (half_width_at(rim, LOCK_Y) + 0.02)
        p = oar('oar_%s' % ('R' if sx < 0 else 'L'))
        p.parent = grp
        p.location = (x, LOCK_Y, LOCK_Z)
        oars.append((sx, p))
    # rower
    rig = crew_rig('fisherman')
    root = rig.j['root']
    root.parent = grp
    rig.rest_loc['root'] = Vector((0.0, SEAT_Y, SEAT_Z + 0.025))
    cargo = Vector((0.0, by, fz + 0.32))
    return {'group': grp, 'rigs': [rig], 'oars': oars, 'cargo': cargo, 'crew_ref': Vector((0, SEAT_Y, 0.8)),
            'stern': Vector((0, ROW_L / 2, 0.0)), 'bow': Vector((0, -ROW_L / 2, 0.0)),
            'pose': pose_rowboat}


def _oar_angles(anim, i, n):
    """(sweep deg, tilt deg): sweep > 0 = blade toward the stern; tilt > 0 = blade down."""
    if anim == 'idle':
        return 6.0, 18.0 + 1.0 * i
    t = i / float(n)
    sweep = -24.0 * math.cos(math.tau * t)                  # -24 (catch, blade forward) .. +24 (finish)
    tilt = 19.0 + 9.0 * math.sin(math.tau * t)              # drive (t<0.5): blade dipped; recovery: lifted
    return sweep, tilt


def set_oars(oars, sweep, tilt):
    for sx, p in oars:
        yaw = sweep if sx > 0 else 180.0 - sweep
        p.rotation_euler = Euler((0.0, math.radians(tilt), math.radians(yaw)), 'XYZ')


def pose_rowboat(B, anim, i, n):
    """Pose the rower + oars for frame i of anim, incl. 2-pass IK so the mittens hold the oar grips."""
    rig = B['rigs'][0]
    grp = B['group']
    sweep, tilt = _oar_angles(anim, i, n)
    t = i / float(n)
    if anim == 'idle':
        bob = 0.012 * (1 if i else -1)
        roll = 1.2 * (1 if i else -1)
        lean = -2.0
    else:
        bob = 0.012 * math.sin(math.tau * t * 2)
        roll = 0.0
        lean = 10.0 * math.cos(math.tau * t + 0.3)        # leaning back at the catch, forward at the finish
    grp.location.z = bob
    grp.rotation_euler.y = math.radians(roll)
    set_oars(B['oars'], sweep, tilt)
    pose = {'hips@': (0, 0.10, 0.065 - 0.338), 'hip_R': (82, 6, 0), 'hip_L': (82, 6, 0),
            'knee_R': (64, 0, 0), 'knee_L': (64, 0, 0), 'spine': (-lean, 0, 0), 'chest': (-lean * 0.4, 0, 0),
            'head': (lean * 0.6 - 4, 0, 0), '_show': {'face_normal'}}
    if anim == 'row' and i in (2, 3):
        pose['_show'] = {'face_smile'}
    rig.apply(pose, yaw_deg=0.0)
    bpy.context.view_layer.update()
    chest_inv = rig.j['chest'].matrix_world.inverted()
    for sx, p in B['oars']:
        grip = p.matrix_world @ Vector((-0.38 - 0.03, 0.0, 0.0))
        side = 'R' if sx < 0 else 'L'
        tgt = chest_inv @ grip
        rig.solve_arm(side, tuple(tgt), (0.8 * (-1 if side == 'R' else 1), 0.3, -0.7))
    bpy.context.view_layer.update()


# =========================================================================== render driver

def holdout_water(size=40.0):
    bpy.ops.mesh.primitive_plane_add(size=size, location=(0, 0, 0))
    w = bpy.context.object
    w.name = 'WaterHoldout'
    w.is_holdout = True
    w.visible_shadow = False
    return w


def boat_meshes(water):
    return [o for o in L.scene_meshes() if o is not water]


def setup_scene(W, H, anchor, samples):
    sc = bc.setup_render(W, H, samples=samples, denoise=True)
    sc.cycles.max_bounces = 4
    sc.cycles.diffuse_bounces = 2
    sc.cycles.glossy_bounces = 2
    sc.cycles.transmission_bounces = 2
    sc.cycles.transparent_max_bounces = 4
    sc.cycles.adaptive_threshold = 0.02
    sc.render.use_persistent_data = True
    bc.setup_camera(W, H, anchor)
    return sc


def measure(B, spec, water):
    """Union screen bbox over every dir / frame (to pick a fixed frame size + anchor)."""
    xs, ys = [], []
    for d in DIRS:
        B['group'].rotation_euler.z = bc.yaw_for_dir(d)
        for anim, a in spec['anims'].items():
            for i in range(a['frames']):
                B['pose'](B, anim, i, a['frames'])
                for p in L.world_points(boat_meshes(water)):
                    if p.z < -0.02:
                        continue
                    x, y = L.screen_xy(p)
                    xs.append(x)
                    ys.append(y)
    return min(xs), max(xs), min(ys), max(ys)


def to_px(p, W, H, anchor):
    x, y = bc.world_to_pixel(tuple(p), W, H, anchor)
    return [int(round(x - anchor[0])), int(round(y - anchor[1]))]


def cam_depth(p):
    """Distance along the view direction (bigger = farther from the camera)."""
    v = Vector((-0.612, 0.612, -0.5)).normalized()
    return Vector(p).dot(v)


def render_boat(key, opts):
    spec = BOATS[key]
    t0 = time.time()
    out = os.path.join(opts['cache'], key)
    os.makedirs(out, exist_ok=True)
    dirs = DIRS if not opts.get('dirs') else opts['dirs'].split(',')
    anims = list(spec['anims']) if not opts.get('anims') else [a for a in opts['anims'].split(',')
                                                               if a in spec['anims']]
    todo = []
    for anim in anims:
        for d in dirs:
            for i in range(spec['anims'][anim]['frames']):
                path = os.path.join(out, '%s_%s_%d.png' % (anim, d, i))
                if opts.get('force') or not os.path.exists(path):
                    todo.append((anim, d, i, path))
    bc.reset_scene()
    L._CUSTOM.clear()
    bc.setup_lighting()
    B = spec['fn']()
    water = holdout_water()
    bpy.context.view_layer.update()
    W, H = spec['frame']
    anchor = spec['anchor']
    x0, x1, y0, y1 = measure(B, spec, water)
    need = (int(math.ceil(-x0)) + 2, int(math.ceil(x1)) + 2, int(math.ceil(-y0)) + 2, int(math.ceil(y1)) + 2)
    fits = need[0] <= anchor[0] and need[1] <= W - anchor[0] and need[2] <= anchor[1] and need[3] <= H - anchor[1]
    print('[%s] content needs left %d right %d up %d down %d -> frame %dx%d anchor %s %s' % (
        key, need[0], need[1], need[2], need[3], W, H, anchor, 'OK' if fits else 'TOO SMALL'), flush=True)
    setup_scene(W, H, anchor, opts.get('samples') or spec['samples'])
    print('[%s] %d frames to render' % (key, len(todo)), flush=True)
    for k, (anim, d, i, path) in enumerate(todo):
        B['group'].rotation_euler.z = bc.yaw_for_dir(d)
        B['pose'](B, anim, i, spec['anims'][anim]['frames'])
        for rig in B['rigs']:
            rig.update_strings()
        tmp = path[:-4] + '.tmp.png'
        bc.render_to(tmp)
        os.replace(tmp, path)
        if k % 8 == 0:
            print('[%s] %d/%d %s_%s_%d  %.0fs' % (key, k + 1, len(todo), anim, d, i, time.time() - t0), flush=True)
    # meta: cargo / wake / bow points per dir (rest pose of anim 0 frame 0)
    meta = {'key': key, 'kind': 'boat', 'frameSize': [W, H], 'anchor': [round(anchor[0] / W, 5),
                                                                          round(anchor[1] / H, 5)],
            'anchorPx': list(anchor), 'anims': spec['anims'], 'notes': spec['notes'], 'fits': fits,
            'need': need}
    cp, wp, bp = {}, {}, {}
    first = list(spec['anims'])[0]
    for d in DIRS:
        B['group'].rotation_euler.z = bc.yaw_for_dir(d)
        B['pose'](B, first, 0, spec['anims'][first]['frames'])
        mw = B['group'].matrix_world
        c = mw @ B['cargo']
        crew = mw @ B['crew_ref']
        behind = cam_depth(c) > cam_depth(crew) + 0.05
        cp[d] = to_px(c, W, H, anchor) + [bool(behind)]
        wp[d] = to_px(mw @ B['stern'], W, H, anchor)
        bp[d] = to_px(mw @ B['bow'], W, H, anchor)
    meta['cargoPoint'] = cp
    meta['wakePoint'] = wp
    meta['bowPoint'] = bp
    complete = all(os.path.exists(os.path.join(out, '%s_%s_%d.png' % (a, d, i)))
                   for a, info in spec['anims'].items() for d in DIRS for i in range(info['frames']))
    meta['complete'] = complete
    with open(os.path.join(out, 'meta.json'), 'w') as f:
        json.dump(meta, f, indent=1)
    print('[%s] done in %.0fs (complete=%s)' % (key, time.time() - t0, complete), flush=True)
