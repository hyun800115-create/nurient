"""
beach_boats.py - characters-style atlases of the v7 Sunny Beach (docs/CONTRACT_V7.md section W): the water-plane boats
swan_pedal_boat / kayak / banana_boat (kind "ship", like assets/ships) and the walking crab (kind "animal").

Rendered by beach_render.py (render_char below), packed by beach_pack.py into assets/beach/ (atlas beach_<key>,
frame names {anim}_{dir}_{i}, 1 px ink outline at pack time, no baked shadow).

Conventions
  * Boats: world origin = sprite anchor = WATERLINE centre of the hull (z 0 = sea surface; everything under it is cut by
    bld_boats' holdout water plane).  Boat-local bow = -Y.  Rendered headings S (bow toward the camera, arriving),
    SE (world +X) and NE (world +Y) + the game mirrors SW <- SE, NW <- NE with flipX (same as assets/ships; E/W/N ->
    `nearest`).  Seats: seats[dir] = seat-surface FRONT-CENTRE of each seat = the anchor of a character in a `sit`
    frame (villagers / townsfolk2 convention, like assets/vehicles); seatsStand[dir] = anchor for an idle frame when
    the facing has no sit frame (backs: NE / NW); seatDrawOrder[dir] back-to-front.  Overlay frames over_<anim>_<dir>_<i>
    (= the hull parts in front of a seated rider, cut with seated-person proxy masks exactly like assets/vehicles):
    draw boat frame -> riders -> overlay frame.
  * Crab: anchor = ground point under the body (z 0 = sand).  dirs = the 5 character dirs S SE E NE N (+ mirrors);
    a dir is the MOVEMENT direction: the crab scuttles sideways, its face turned 90 deg from the movement (toward the
    camera where possible), exactly like a real crab.  walk 6 f, idle 4 f (claws snap, eye stalks twitch).
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
from prop_lib import C, flat, box, cyl, sphere, blob, extrude, hexmix
import life2_lib as L2
import bld_boats as BBo
import veh_lib as VL
import beach_lib as B

CHARS = OrderedDict()
SHIP_DIRS = ['S', 'SE', 'NE']
SHIP_MIRROR = {'SW': 'SE', 'NW': 'NE'}
CHAR_DIRS = ['S', 'SE', 'E', 'NE', 'N']
CHAR_MIRROR = {'SW': 'SE', 'W': 'E', 'NW': 'NE'}
SECTORS = ['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE']
CAM_TOWARD = Vector((0.612372, -0.612372, 0.5)).normalized()
STAND_DROP = 0.065 - 0.338            # vehicles' convention: standing anchor below the seat surface (m)
MARGIN = 6


def char(key, kind, anims, dirs=None, mirror=None, samples=24, notes='', water=True, length=None, beam=None, **extra):
    def deco(fn):
        CHARS[key] = dict(key=key, fn=fn, kind=kind, anims=anims, dirs=list(dirs or SHIP_DIRS),
                          mirror=mirror or SHIP_MIRROR, samples=samples, notes=notes, water=water, lengthM=length,
                          beamM=beam, extra=extra)
        return fn
    return deco


# =========================================================================== render (copy-and-extend of ship_render)

def screen_dir(v):
    sx = (v.x + v.y) * math.sqrt(0.5)
    sy = (v.x - v.y) * math.sqrt(0.5) * 0.5
    a = math.atan2(sy * 2.0, sx)
    return SECTORS[int(round(a / (math.pi / 4))) % 8]


def to_px(p):
    x, y = bc.world_to_pixel(tuple(p), 0, 0, (0.0, 0.0))
    return [int(round(x)), int(round(y))]


def proxy(name, P, f, parent, w=0.62, d=0.8, h=1.75, below=0.55):
    """Seated-person volume (a chibi head is ~0.6 m wide, ~1.2 m above the seat), emissive white, camera-only."""
    back = -f
    c = P + back * 0.14 + Vector((0, 0, h / 2 - below))
    yaw = math.degrees(math.atan2(f.x, -f.y))
    o = box(name, (w, d, h), tuple(c), rot=(0, 0, yaw), mat=VL.mask_emit(), bevel=0.2, segs=3, origin='center')
    o.parent = parent
    o.hide_render = True
    o.visible_shadow = False
    for attr in ('visible_diffuse', 'visible_glossy', 'visible_transmission', 'visible_volume_scatter'):
        try:
            setattr(o, attr, False)
        except Exception:
            pass
    return o


def meshes(Bd, water):
    return [o for o in bpy.context.scene.objects if o.type in ('MESH', 'CURVE') and not o.hide_render
            and o is not water and o not in Bd.get('proxies', [])]


def orient(Bd, spec, d):
    g = Bd['group']
    if spec['kind'] == 'animal':
        g.rotation_euler = (0.0, 0.0, bc.yaw_for_dir(d) - math.radians(90.0))
    else:
        g.rotation_euler = (0.0, 0.0, bc.yaw_for_dir(d))


def frame_list(spec, sel_dirs=None, sel_anims=None):
    out = []
    for anim, a in spec['anims'].items():
        if sel_anims and anim not in sel_anims:
            continue
        for d in a.get('dirs') or spec['dirs']:
            if sel_dirs and d not in sel_dirs:
                continue
            for i in range(a['frames']):
                out.append(('%s_%s_%d' % (anim, d, i), d, anim, i))
    return out


def measure(Bd, spec, water):
    xs, ys = [], []
    for name, d, anim, i in frame_list(spec):
        orient(Bd, spec, d)
        Bd['pose'](Bd, anim, i, spec['anims'][anim]['frames'])
        bpy.context.view_layer.update()
        for p in L.world_points(meshes(Bd, water)):
            if spec['water'] and p.z < -0.02:
                continue
            x, y = L.screen_xy(p)
            xs.append(x)
            ys.append(y)
    return min(xs), max(xs), min(ys), max(ys)


def render_masks(Bd, spec, water, out, todo):
    """pall_ = proxies alone, pvis_ = proxies with the boat as holdout (veh_render.render_masks, simplified)."""
    objs = [o for o in bpy.context.scene.objects if o.type in ('MESH', 'CURVE') and o is not water
            and o not in Bd['proxies']]
    snap = [(o, o.hide_render, o.is_holdout) for o in objs]
    lights = [(o, o.hide_render) for o in bpy.context.scene.objects if o.type == 'LIGHT']
    sc = bpy.context.scene
    old = (sc.cycles.samples, sc.cycles.use_denoising)
    sc.cycles.samples = 12
    sc.cycles.use_denoising = False
    for o, _ in lights:
        o.hide_render = True
    try:
        for phase in ('vis', 'all'):
            for name, d, anim, i in todo:
                orient(Bd, spec, d)
                Bd['pose'](Bd, anim, i, spec['anims'][anim]['frames'])
                for o in objs:
                    if phase == 'all':
                        o.hide_render = True
                    elif o.get('no_mask'):
                        o.hide_render = True
                    else:
                        o.is_holdout = True
                for o in Bd['proxies']:
                    o.hide_render = False
                bpy.context.view_layer.update()
                path = os.path.join(out, '%s_%s.png' % ('pvis' if phase == 'vis' else 'pall', name))
                tmp = path[:-4] + '.tmp.png'
                bc.render_to(tmp)
                os.replace(tmp, path)
                for o, hr, ho in snap:
                    o.hide_render = hr
                    o.is_holdout = ho
    finally:
        for o, hr, ho in snap:
            o.hide_render = hr
            o.is_holdout = ho
        for o in Bd['proxies']:
            o.hide_render = True
        for o, hr in lights:
            o.hide_render = hr
        sc.cycles.samples, sc.cycles.use_denoising = old


def render_char(key, opts):
    spec = CHARS[key]
    t0 = time.time()
    out = os.path.join(opts['cache'], key)
    os.makedirs(out, exist_ok=True)
    bc.reset_scene()
    L._CUSTOM.clear()
    bc.setup_lighting()
    Bd = spec['fn']()
    Bd.setdefault('proxies', [])
    grp = Bd['group']
    for o in list(bpy.context.scene.objects):
        if o is grp or o.parent is not None or o.type in ('CAMERA', 'LIGHT'):
            continue
        o.parent = grp
    water = BBo.holdout_water() if spec['water'] else None
    bpy.context.view_layer.update()
    x0, x1, y0, y1 = measure(Bd, spec, water)
    m = MARGIN
    W = int(math.ceil(x1) - math.floor(x0)) + 2 * m
    H = int(math.ceil(y1) - math.floor(y0)) + 2 * m
    W += W % 2
    H += H % 2
    anchor = (int(-math.floor(x0)) + m, int(-math.floor(y0)) + m)
    sel_dirs = set(opts['dirs'].split(',')) if opts.get('dirs') else None
    sel_anims = set(opts['anims'].split(',')) if opts.get('anims') else None
    frames = frame_list(spec)
    todo = []
    for name, d, anim, i in frame_list(spec, sel_dirs, sel_anims):
        path = os.path.join(out, name + '.png')
        stale = False
        if os.path.exists(path) and not opts.get('force'):
            from PIL import Image as _I
            try:
                stale = _I.open(path).size != (W, H)
            except Exception:
                stale = True
        if opts.get('force') or stale or not os.path.exists(path):
            todo.append((name, d, anim, i))
    print('[%s] frame %dx%d anchor %s, %d frames to render' % (key, W, H, anchor, len(todo)), flush=True)
    if todo:
        BBo.setup_scene(W, H, anchor, opts.get('samples') or spec['samples'])
        for k, (name, d, anim, i) in enumerate(todo):
            t1 = time.time()
            orient(Bd, spec, d)
            Bd['pose'](Bd, anim, i, spec['anims'][anim]['frames'])
            bpy.context.view_layer.update()
            path = os.path.join(out, name + '.png')
            tmp = path[:-4] + '.tmp.png'
            bc.render_to(tmp)
            os.replace(tmp, path)
            print('[%s] %d/%d %s %.1fs' % (key, k + 1, len(todo), name, time.time() - t1), flush=True)
        if Bd['proxies']:
            render_masks(Bd, spec, water, out, todo)
    write_meta(Bd, spec, key, out, W, H, anchor, frames)
    print('[%s] done in %.0fs' % (key, time.time() - t0), flush=True)


def write_meta(Bd, spec, key, out, W, H, anchor, frames):
    first = list(spec['anims'])[0]
    pts = {}
    seats, seat_dirs, seat_stand, seat_order = {}, {}, {}, {}
    for d in spec['dirs']:
        orient(Bd, spec, d)
        Bd['pose'](Bd, first, 0, spec['anims'][first]['frames'])
        bpy.context.view_layer.update()
        mw = Bd['group'].matrix_world
        R = mw.to_3x3()
        for field, p in (Bd.get('points') or {}).items():
            if isinstance(p, list):
                pts.setdefault(field, {})[d] = [to_px(mw @ Vector(q)) for q in p]
            else:
                pts.setdefault(field, {})[d] = to_px(mw @ Vector(p))
        sl, sd, ss, depth = [], [], [], []
        for s in Bd.get('seats', []):
            P = mw @ Vector(s['loc'])
            f = (R @ Vector(s['facing'])).normalized()
            sl.append(to_px(P))
            sd.append(screen_dir(f))
            ss.append(to_px(P - f * 0.12 + Vector((0, 0, STAND_DROP))))
            depth.append(P.dot(CAM_TOWARD))
        if Bd.get('seats'):
            seats[d], seat_dirs[d], seat_stand[d] = sl, sd, ss
            seat_order[d] = sorted(range(len(sl)), key=lambda k: depth[k])
    meta = {'key': key, 'kind': spec['kind'], 'frameSize': [W, H], 'anchorPx': list(anchor),
            'anchor': [round(anchor[0] / float(W), 5), round(anchor[1] / float(H), 5)], 'dirs': spec['dirs'],
            'mirror': spec['mirror'], 'anims': {a: dict(v) for a, v in spec['anims'].items()},
            'lengthM': spec['lengthM'], 'beamM': spec['beamM'], 'notes': spec['notes'], 'points': pts,
            'frames': [f[0] for f in frames], 'extra': spec['extra'], 'masks': bool(Bd['proxies'])}
    if Bd.get('seats'):
        meta.update({'seats': seats, 'seatDirs': seat_dirs, 'seatsStand': seat_stand, 'seatDrawOrder': seat_order,
                     'seatNames': [s['name'] for s in Bd['seats']]})
    meta['complete'] = all(os.path.exists(os.path.join(out, f[0] + '.png')) for f in frames) and \
        (not Bd['proxies'] or all(os.path.exists(os.path.join(out, 'pall_%s.png' % f[0])) and
                                  os.path.exists(os.path.join(out, 'pvis_%s.png' % f[0])) for f in frames))
    with open(os.path.join(out, 'meta.json'), 'w') as f:
        json.dump(meta, f, indent=1)


# =========================================================================== shared bits

def new_group(name='grp'):
    g = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(g)
    return g


def gloss_white():
    return VL.paint(B.WHITE, 0.3, 0.55)


def chain_tube(name, path_pts, radii, mat, n=48, segs=16, rings=10):
    """A smooth fat tube (swan neck, banana) as a chain of overlapping spheres along a Catmull-Rom path; radius
    interpolated along it."""
    pts = L2.catmull([Vector(p) for p in path_pts], n=max(2, n // max(1, len(path_pts) - 1)))
    mb = L2.MB()
    for k, p in enumerate(pts):
        t = k / max(1, len(pts) - 1)
        r = radii(t) if callable(radii) else radii
        mb.sphere(r, mat, loc=tuple(p), segs=segs, rings=rings)
    return mb.done(name), pts


def foam_puffs(name, spots, mat, seed=0):
    """Little white foam blobs on the water (camera-only, no shadow); returns objs."""
    out = []
    for k, (p, r) in enumerate(spots):
        o = blob('%s%d' % (name, k), r, p, mat, scale=(1.0, 1.0, 0.35), seed=seed + k, amp=0.3, subdiv=2)
        o.visible_shadow = False
        o['no_mask'] = True
        out.append(o)
    return out


# =========================================================================== SWAN PEDAL BOAT

SW_L, SW_W = 2.7, 1.5
SWAN_ANIMS = OrderedDict([('idle', {'frames': 2, 'fps': 3, 'repeat': -1}),
                          ('move', {'frames': 4, 'fps': 7, 'repeat': -1})])


@char('swan_pedal_boat', 'ship', SWAN_ANIMS, samples=26, length=SW_L, beam=SW_W,
      notes='Swan pedal boat (오리배, ~2.7 m): glossy white swan hull with sculpted wings and a curled feather tail, '
            'a long S-curved neck with a cute face (orange beak, shiny black eyes, pink blush) and a pink ribbon bow, '
            'a sky-blue cockpit with a two-seat bench and a steering lever. idle 2 f (gentle bob), move 4 f (the '
            'neck nods, foam at the bow, churning at the stern paddle). Riders are drawn by the game at seats / '
            'seatsStand + the over_* overlay (two seats side by side, both facing the bow).',
      seatsNote='seat 0 = left, seat 1 = right (boat-local), sit frames face the bow')
def b_swan():
    g = new_group('swan')
    white = gloss_white()
    shade_w = VL.paint('#E9EEF4', 0.35, 0.5)
    with L.Collect() as body:
        # hull: an egg-shaped tub, wider at the stern, bottom under the water
        hull = blob('hull', 1.0, (0, 0.08, 0.05), white, scale=(SW_W / 2, SW_L / 2, 0.62), seed=1, amp=0.0,
                    subdiv=4)
        cut = VL.rbox('cockpit_cut', (1.06, 1.12, 1.0), (0, 0.14, 0.38), white, r=0.3, segs=4, origin='bottom')
        VL.add_bool(hull, cut, transfer=False)
        cut.parent = None
        # inner cockpit tub (sky blue) + floor
        inner = VL.rbox('cockpit', (1.04, 1.1, 0.42), (0, 0.14, 0.02), VL.paint('#8FCDEB', 0.4, 0.3), r=0.26, segs=4)
        inner['no_mask'] = True
        # gunwale rim (white rounded lip around the cockpit opening)
        rim_pts = VL.rounded_pts(1.12, 1.18, 0.34, n=8, cx=0.0, cy=0.14)
        mbr = L2.MB()
        for a, b_ in zip(rim_pts, rim_pts[1:] + rim_pts[:1]):
            mbr.seg((a[0], a[1], 0.5), (b_[0], b_[1], 0.5), 0.045, white, segs=10)
        mbr.done('rim')
        # wings: raised feather reliefs on both sides
        for sx in (-1, 1):
            wing(sx, white, shade_w)
        # tail: three curled feather plumes at the stern
        for k, (dx, h, s) in enumerate(((0.0, 0.62, 1.0), (-0.2, 0.5, 0.8), (0.2, 0.5, 0.8))):
            sphere('tail%d' % k, 0.2 * s, (dx, SW_L / 2 - 0.12, h), white, scale=(0.75, 1.0, 1.25),
                   rot=(-35, 0, 0), segs=16, rings=10)
        sphere('tailtip', 0.13, (0, SW_L / 2 + 0.04, 0.86), white, scale=(0.7, 1.1, 1.0), rot=(-55, 0, 0),
               segs=14, rings=8)
        # bench seat (two cushions) + backrest + steering lever
        for sx in (-1, 1):
            o = VL.rbox('seat%d' % sx, (0.42, 0.4, 0.1), (sx * 0.23, 0.3, 0.33), VL.paint('#2E6FB8', 0.45, 0.2),
                        r=0.05)
            o['no_mask'] = True
        o = VL.rbox('seatback', (0.92, 0.1, 0.36), (0, 0.52, 0.38), VL.paint('#2E6FB8', 0.45, 0.2), r=0.05)
        o['no_mask'] = True
        B.rod('lever', (0, -0.05, 0.25), (0, -0.12, 0.62), 0.018, B.metal('#D7DEE6', 0.25, 0.8), segs=8)
        sphere('knob', 0.045, (0, -0.125, 0.64), VL.paint(B.RED, 0.3, 0.6), segs=12, rings=8)
        # number plate on the side (blank white oval with a blue rim) for the rental number
        for sx in (-1, 1):
            o = cyl('plate%d' % sx, 0.11, 0.02, (sx * (SW_W / 2 - 0.03), 0.42, 0.32), rot=(0, 90 * sx, 0),
                    mat=VL.paint('#2E6FB8', 0.4, 0.4), segs=24, origin='center', bevel=0.005)
            del o
    # neck + head (separate group so it can nod)
    neck_g = new_group('neckg')
    neck_g.location = (0, -SW_L / 2 + 0.42, 0.42)
    with L.Collect() as neck:
        path = [(0, 0.0, 0.0), (0, -0.18, 0.28), (0, -0.12, 0.62), (0, 0.04, 0.92), (0, -0.02, 1.16),
                (0, -0.16, 1.26)]
        chain_tube('neck', path, lambda t: 0.2 - 0.09 * t, white, n=40)
        hx, hy, hz = 0, -0.2, 1.27
        sphere('head', 0.15, (hx, hy, hz), white, scale=(0.95, 1.15, 0.95), segs=20, rings=14)
        # beak: orange cone with a black knob at its base
        cyl('beak', 0.075, 0.2, (hx, hy - 0.12, hz - 0.03), rot=(95, 0, 0), mat=VL.paint('#F49A3A', 0.35, 0.5),
            segs=16, r_top=0.02, origin='bottom', bevel=0.015)
        sphere('knobb', 0.05, (hx, hy - 0.11, hz + 0.03), VL.paint('#2B2F3A', 0.3, 0.5), segs=12, rings=8)
        for sx in (-1, 1):
            sphere('eye%d' % sx, 0.036, (hx + sx * 0.098, hy - 0.06, hz + 0.04), VL.paint('#1E2026', 0.15, 0.8),
                   segs=12, rings=8)
            sphere('hl%d' % sx, 0.011, (hx + sx * 0.118, hy - 0.08, hz + 0.06), flat('#FFFFFF', 0.2,
                                                                                     emission='#FFFFFF',
                                                                                     emission_strength=1.5),
                   segs=8, rings=5)
            sphere('blush%d' % sx, 0.035, (hx + sx * 0.12, hy - 0.04, hz - 0.03), flat('#F7A8B8', 0.6),
                   scale=(0.5, 1.0, 0.7), segs=10, rings=6)
        L2.bow('bow', (0, -0.12, 0.42), 0.13, L2.satin('#F28DB2'), rz=0.0, tails=0.14, tail_out=0.03, tilt=8.0)
    for o in neck.objs:
        if o.parent is None:
            o.parent = neck_g
    neck_g.parent = g
    foam_m = B.foam_mat('swanfoam', 0.92)
    bow_foam = foam_puffs('bfoam', [((sx * 0.32, -SW_L / 2 + 0.22, 0.0), 0.12) for sx in (-1, 1)] +
                          [((0, -SW_L / 2 + 0.05, 0.0), 0.13)], foam_m, seed=3)
    stern_foam = foam_puffs('sfoam', [((dx, SW_L / 2 + dy, 0.0), r) for dx, dy, r in
                                      ((-0.25, 0.05, 0.13), (0.22, 0.12, 0.12), (0.0, 0.25, 0.15),
                                       (-0.1, 0.42, 0.1), (0.15, 0.5, 0.08))], foam_m, seed=9)
    ring_m = B.foam_mat('swanring', 0.55)
    ring = B.torus('wl', 1.0, 0.035, (0, 0.08, 0.0), mats=[ring_m], M=40, K=6, scale=(SW_W / 2 + 0.06, SW_L / 2 + 0.06,
                                                                                         0.3))
    ring.visible_shadow = False
    ring['no_mask'] = True
    del body
    seats = []
    for k, sx in enumerate((-1, 1)):
        P = Vector((sx * 0.23, 0.1, 0.38))
        f = Vector((0, -1, 0))
        seats.append({'loc': P, 'facing': f, 'name': 'seat%d' % k})
    proxies = [proxy('px%d' % k, s['loc'], s['facing'], g, w=0.5, d=0.72) for k, s in enumerate(seats)]

    def pose(Bd, anim, i, n):
        if anim == 'idle':
            s = 1 if i else -1
            g.location = (0, 0, 0.015 * s)
            g.rotation_euler.x = math.radians(0.8 * s)
            g.rotation_euler.y = math.radians(-0.8 * s)
            neck_g.rotation_euler = (math.radians(2.0 * s), 0, 0)
            for o in bow_foam + stern_foam:
                o.hide_render = True
            ring.scale = (SW_W / 2 + 0.06, SW_L / 2 + 0.06, 0.3)
        else:
            t = math.tau * i / float(n)
            g.location = (0, 0, 0.025 * math.sin(t))
            g.rotation_euler.x = math.radians(1.6 * math.cos(t))
            g.rotation_euler.y = math.radians(1.2 * math.sin(t))
            neck_g.rotation_euler = (math.radians(5.0 * math.sin(t + 0.6)), 0, 0)
            for k, o in enumerate(bow_foam):
                o.hide_render = False
                s = 0.8 + 0.35 * (0.5 + 0.5 * math.sin(t + k * 2.1))
                o.scale = (s, s, 0.35 * s)
            for k, o in enumerate(stern_foam):
                o.hide_render = False
                s = 0.7 + 0.5 * (0.5 + 0.5 * math.sin(t * 1.0 - k * 1.3))
                o.scale = (s, s, 0.4 * s)
                o.location.z = 0.02 * math.sin(t + k)
            ring.scale = (SW_W / 2 + 0.1, SW_L / 2 + 0.12, 0.3)
        bpy.context.view_layer.update()

    return {'group': g, 'pose': pose, 'seats': seats, 'proxies': proxies,
            'points': {'stern': (0, SW_L / 2 + 0.1, 0.0), 'bow': (0, -SW_L / 2 - 0.05, 0.0),
                       'head': (0, -SW_L / 2 + 0.22, 1.72)}}


def wing(sx, white, shade_w):
    """Sculpted wing on the swan's side: a raised teardrop with three rows of scalloped feathers."""
    x = sx * (SW_W / 2 - 0.08)
    mb = L2.MB()
    for row, (z, n, r, y0, y1) in enumerate(((0.36, 6, 0.1, -0.5, 0.75), (0.24, 5, 0.09, -0.3, 0.8),
                                             (0.13, 4, 0.08, -0.05, 0.85))):
        for k in range(n):
            y = y0 + (y1 - y0) * k / max(1, n - 1)
            mb.sphere(r, white if row % 2 == 0 else shade_w, loc=(x + sx * 0.07, y, z),
                      scale=(0.5, 1.3, 0.85), segs=14, rings=8)
    mb.done('wing%d' % sx)


# =========================================================================== CRAB

CRAB_ANIMS = OrderedDict([('idle', {'frames': 4, 'fps': 6, 'repeat': -1}),
                          ('walk', {'frames': 6, 'fps': 12, 'repeat': -1})])
CRAB_RED = '#E8584A'
CRAB_BELLY = '#F7B39A'


@char('crab', 'animal', CRAB_ANIMS, dirs=CHAR_DIRS, mirror=CHAR_MIRROR, samples=28, water=False,
      notes='Beach crab (~0.5 m across with its claws): glossy coral-red shell with bumps, big googly eyes on stalks '
            '(white highlight), two raised pincers, three legs a side. dir = the MOVEMENT direction: it scuttles '
            'sideways with its face turned toward the camera where possible. walk 6 f (tripod leg cycle, body bob, '
            'claws sway), idle 4 f (snip-snap claws, eye stalks twitch). No baked shadow: draw a soft ellipse '
            'shadow [w, h] under the anchor.', shadow=[34, 14])
def b_crab():
    g = new_group('crab')
    shell_m = VL.paint(CRAB_RED, 0.32, 0.45)
    dark = VL.paint(hexmix(CRAB_RED, '#7A1F18', 0.25), 0.4, 0.3)
    belly = VL.paint(CRAB_BELLY, 0.45, 0.2)
    body = new_group('cbody')
    body.parent = g
    H0 = 0.13
    with L.Collect() as bc_:
        sphere('cara', 0.17, (0, 0, 0), shell_m, scale=(1.0, 0.72, 0.5), segs=24, rings=14)
        sphere('bel', 0.15, (0, 0.0, -0.025), belly, scale=(1.0, 0.7, 0.35), segs=20, rings=10)
        mb = L2.MB()
        for k, (bx, by) in enumerate(((-0.07, 0.02), (0.07, 0.02), (0.0, 0.06), (-0.11, -0.03), (0.11, -0.03))):
            mb.sphere(0.022, shell_m, loc=(bx, by, 0.07), segs=10, rings=6)
        mb.done('bumps')
        # smile
        mbm = L2.MB()
        pts = [(math.cos(a) * 0.04, -0.118, 0.012 - math.sin(a) * 0.012 - 0.012) for a in
               [math.pi * (0.15 + 0.7 * k / 6) for k in range(7)]]
        for p, q in zip(pts, pts[1:]):
            mbm.seg(p, q, 0.0055, flat('#5A1A16', 0.6), segs=5)
        mbm.done('smile')
    for o in bc_.objs:
        if o.parent is None:
            o.parent = body
    body.location = (0, 0, H0)
    # eye stalks (groups, twitch)
    eyes = []
    for sx in (-1, 1):
        e = new_group('eye%d' % sx)
        e.parent = body
        e.location = (sx * 0.055, -0.07, 0.05)
        with L.Collect() as ec:
            cyl('stalk', 0.018, 0.08, (0, 0, 0), mat=shell_m, segs=10, bevel=0.006)
            sphere('ball', 0.042, (0, -0.005, 0.1), flat('#FFFFFF', 0.25), segs=16, rings=10)
            sphere('pupil', 0.025, (0, -0.032, 0.103), VL.paint('#1E2026', 0.15, 0.8), segs=12, rings=8)
            sphere('glint', 0.009, (sx * 0.004 - 0.008, -0.052, 0.118), flat('#FFFFFF', 0.2, emission='#FFFFFF',
                                                                              emission_strength=1.5), segs=8, rings=5)
        for o in ec.objs:
            if o.parent is None:
                o.parent = e
        eyes.append(e)
    # claws: shoulder group -> arm -> pincer (fixed lower jaw + moving finger)
    claws = []
    for sx in (-1, 1):
        sh = new_group('sh%d' % sx)
        sh.parent = body
        sh.location = (sx * 0.15, -0.06, 0.0)
        with L.Collect() as ac:
            B.rod('arm1', (0, 0, 0), (sx * 0.07, -0.05, 0.06), 0.03, shell_m, segs=10)
            B.rod('arm2', (sx * 0.07, -0.05, 0.06), (sx * 0.1, -0.08, 0.13), 0.028, shell_m, segs=10)
        for o in ac.objs:
            if o.parent is None:
                o.parent = sh
        pin = new_group('pin%d' % sx)
        pin.parent = sh
        pin.location = (sx * 0.1, -0.08, 0.13)
        with L.Collect() as pc:
            sphere('palm', 0.065, (0, 0, 0.03), shell_m, scale=(0.85, 0.8, 1.15), segs=18, rings=10)
            sphere('jaw', 0.035, (0, -0.02, 0.1), shell_m, scale=(0.7, 0.8, 1.5), rot=(-15, 0, 0), segs=12, rings=8)
            sphere('tipj', 0.016, (0, -0.032, 0.15), dark, segs=8, rings=5)
        for o in pc.objs:
            if o.parent is None:
                o.parent = pin
        fing = new_group('fing%d' % sx)
        fing.parent = pin
        fing.location = (sx * 0.035, 0.0, 0.07)
        with L.Collect() as fc:
            sphere('fing', 0.028, (sx * 0.012, -0.01, 0.05), shell_m, scale=(0.7, 0.8, 1.6), rot=(0, -sx * 20, 0),
                   segs=12, rings=8)
            sphere('tipf', 0.014, (sx * 0.03, -0.012, 0.095), dark, segs=8, rings=5)
        for o in fc.objs:
            if o.parent is None:
                o.parent = fing
        claws.append((sh, pin, fing, sx))
    # legs: 3 a side, two segments (hip group -> knee group)
    legs = []
    for sx in (-1, 1):
        for k, ly in enumerate((-0.03, 0.03, 0.08)):
            hip = new_group('hip%d%d' % (sx, k))
            hip.parent = body
            hip.location = (sx * 0.14, ly, -0.01)
            with L.Collect() as lc:
                B.rod('l1', (0, 0, 0), (sx * 0.09, 0.0, 0.04), 0.016, shell_m, segs=8)
            for o in lc.objs:
                if o.parent is None:
                    o.parent = hip
            knee = new_group('knee%d%d' % (sx, k))
            knee.parent = hip
            knee.location = (sx * 0.09, 0.0, 0.04)
            with L.Collect() as kc:
                B.rod('l2', (0, 0, 0), (sx * 0.05, 0.0, -0.17), 0.013, shell_m, segs=8, r2=0.006)
            for o in kc.objs:
                if o.parent is None:
                    o.parent = knee
            hip.rotation_euler = (0, math.radians(sx * -10), math.radians(sx * (k - 1) * 18))
            legs.append((hip, knee, sx, k))

    def pose(Bd, anim, i, n):
        t = math.tau * i / float(n)
        if anim == 'idle':
            body.location = (0, 0, H0 + 0.006 * math.sin(t))
            body.rotation_euler = (0, 0, 0)
            for e, sx in zip(eyes, (-1, 1)):
                e.rotation_euler = (math.radians(6 * math.sin(t + sx)), math.radians(sx * 8 * math.sin(t * 2)), 0)
            for sh, pin, fing, sx in claws:
                ph = t + (0 if sx < 0 else math.pi)
                sh.rotation_euler = (math.radians(-8 * math.sin(ph)), 0, math.radians(sx * 6 * math.sin(ph)))
                open_ = 0.5 + 0.5 * math.sin(ph * 2)
                fing.rotation_euler = (0, math.radians(sx * (8 + 34 * open_)), 0)
            for hip, knee, sx, k in legs:
                hip.rotation_euler = (0, math.radians(sx * -10), math.radians(sx * (k - 1) * 18))
                knee.rotation_euler = (0, 0, 0)
        else:
            body.location = (0, 0, H0 + 0.014 * abs(math.sin(t * 1.5)))
            body.rotation_euler = (0, math.radians(4 * math.sin(t)), 0)
            for e, sx in zip(eyes, (-1, 1)):
                e.rotation_euler = (math.radians(-4), math.radians(-6 * math.sin(t)), 0)
            for sh, pin, fing, sx in claws:
                sh.rotation_euler = (math.radians(6 * math.sin(t + sx)), math.radians(sx * 6 * math.sin(t)), 0)
                fing.rotation_euler = (0, math.radians(sx * 12), 0)
            for hip, knee, sx, k in legs:
                ph = t + (math.pi if (k + (sx > 0)) % 2 else 0.0)
                lift = max(0.0, math.sin(ph))
                hip.rotation_euler = (math.radians(0.0), math.radians(sx * (-10 - 22 * lift)),
                                      math.radians(sx * (k - 1) * 18 + 22 * math.cos(ph)))
                knee.rotation_euler = (0, math.radians(sx * 10 * lift), 0)
        bpy.context.view_layer.update()

    return {'group': g, 'pose': pose, 'points': {'head': (0, -0.1, 0.36)}}
