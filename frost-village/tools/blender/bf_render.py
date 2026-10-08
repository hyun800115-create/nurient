"""
bf_render.py - render the beachfolk paper-doll layers (CONTRACT_V7 Y) with Blender Cycles.

Builds on tf_render / tf_body / tf_parts / tf_anim / tf2_* (imported, never edited) + bf_anim / bf_parts.
Output cache (default <scratch>/v7_beachfolk/cache; the townfolk caches are never written):

  head/<pose>_<dir>/<layer>.png   new poses 'swim' (5 dirs, water-cut below the chin) and 'lie' (SE, NE): EVERY
                                  v4 head layer + the new head parts; old 20 poses (v4 17 + tf2 'down'): only the
                                  new head parts and the new face expressions (laugh / relax / wow); head.none and
                                  mask_uw everywhere.
  body/<base>/<anim>_<dir>/<layer>.png  (tiled, tile i = frame i)
      new anims: every new body part whose anim set (bf_presets.PART_ANIMS) includes the anim + limbs + mask
                 (+ mask_uw in water anims)
      v4 / v5 anims: the new body parts whose anim set includes the anim + mask
  body/<base>/meta3.json   headOffset(F), zfront, ballPoint, digPoint, splashPoint, shadow hints, tiles per anim

Water anims (swim, float, splash_play, surf): the water surface is world z = 0 and a camera-only HOLDOUT block
fills z < 0, so everything under the surface is cut out of every layer.  'mask_uw' (everything under the surface,
seen through the transparent parts above it) lets bf_pack erase the ink ring along the waterline.

Usage (build machine, bpy module; resumable - only missing layer PNGs render):
    /tmp/bvenv/bin/python tools/blender/bf_render.py -- --mode full --combos look [--out DIR]   (look-dev)
    /tmp/bvenv/bin/python tools/blender/bf_render.py -- --mode head [--frames new|old|all] [--reverse]
    /tmp/bvenv/bin/python tools/blender/bf_render.py -- --mode body --bases adult_slim [--set new|old|all] [--reverse]
    /tmp/bvenv/bin/python tools/blender/bf_render.py -- --mode meta --bases all
Options: --anims a,b  --dirs S,SE  --samples 6  --cache DIR  --force  --parts a,b  --chunk 24 (head: view layers
per linked scene copy, see ChunkLayers)
Then: python3 tools/blender/bf_pack.py && python3 tools/blender/bf_check.py
"""
import json
import math
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

import bpy                                   # noqa: E402
from mathutils import Vector, Quaternion, Matrix     # noqa: E402

import bl_common as bc                       # noqa: E402
import tf_anim as ta                         # noqa: E402
import tf_body as tb                         # noqa: E402
import tf_parts as tp                        # noqa: E402
import tf_render as tr                       # noqa: E402
import tf2_anim as ta2                       # noqa: E402
import tf2_render as tr2                     # noqa: E402   (registers the tf2 face exprs + parts in-process)
import tf2_parts as tp2                      # noqa: E402
import bf_anim as ba                         # noqa: E402
import bf_parts as bp                        # noqa: E402
import bf_presets as bpr                     # noqa: E402

ta.FACE_EXPR.update(ba.FACE_EXPR3)

FRAME = tr.FRAME
ANCHOR = tr.ANCHOR
HEAD_ANCHOR = tr.HEAD_ANCHOR
SCRATCH = '/tmp/claude-0/-home-user-nurient/8cadcbb8-7304-572f-9d68-572175fda0e7/scratchpad/v7_beachfolk'
DEFAULT_CACHE = os.path.join(SCRATCH, 'cache')
V4_HEAD = [p.name for p in tp.head_parts() if p.name not in tp2.NEW_PARTS and p.name not in bp.NEW_PARTS]
# tile layout per anim (w x h of the 128x128 frame kept, offset ox)
TILES = {'sunbathe': (128, 128, 0), 'surf': (128, 128, 0), 'sit': (96, 128, 16), 'swim': (96, 128, 16),
         'float': (96, 128, 16), 'splash_play': (96, 128, 16)}
CAM_FWD = None


def parse_args():
    a = bc.script_args()
    opt = {'mode': 'full', 'bases': 'all', 'set': 'all', 'anims': 'all', 'dirs': 'all', 'samples': '6',
           'cache': DEFAULT_CACHE, 'force': False, 'reverse': False, 'combos': 'look', 'out': None,
           'parts': 'all', 'frames': 'all', 'look': 'all', 'chunk': '24'}
    i = 0
    while i < len(a):
        k = a[i].lstrip('-')
        if k in ('force', 'reverse', 'strict'):
            opt[k] = True
            i += 1
        else:
            opt[k] = a[i + 1]
            i += 2
    return opt


def sel(spec, full):
    return list(full) if spec == 'all' else [x for x in spec.split(',') if x in full]


def tile_of(anim):
    w, h, ox = TILES.get(anim, (tr.BODY_TW, tr.BODY_TH, tr.TILE_OX))
    return {'w': w, 'h': h, 'cols': tr.BODY_COLS, 'ox': ox, 'oy': 0}


# --------------------------------------------------------------------------- water

def water_block(ctx):
    """Camera-only holdout box filling z < 0 (its own collection 'WATER')."""
    with ctx.into('WATER'):
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, -2.5))
        ob = bpy.context.object
        ob.name = 'water_holdout'
        ob.scale = (60.0, 60.0, 5.0)
        ob.data.materials.append(tp.M('water_hold', '#2E8AA8', 0.1))
    for attr in ('visible_diffuse', 'visible_glossy', 'visible_shadow', 'visible_transmission',
                 'visible_volume_scatter'):
        if hasattr(ob, attr):
            setattr(ob, attr, False)
    ob.hide_render = True
    return ob


def set_water(ob, on, z=0.0):
    ob.hide_render = not on
    ob.location.z = z - 2.5


_UW = {}


def uw_material():
    """Override for 'mask_uw': white where world z < level (Value node 'level'), transparent above."""
    m = bpy.data.materials.get('bf_uw')
    if m is not None:
        return m
    m = bpy.data.materials.new('bf_uw')
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    geo = nt.nodes.new('ShaderNodeNewGeometry')
    sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    lvl = nt.nodes.new('ShaderNodeValue')
    lvl.name = 'level'
    lvl.outputs[0].default_value = 0.0
    lt = nt.nodes.new('ShaderNodeMath')
    lt.operation = 'LESS_THAN'
    em = nt.nodes.new('ShaderNodeEmission')
    em.inputs['Color'].default_value = (1, 1, 1, 1)
    em.inputs['Strength'].default_value = 1.0
    trn = nt.nodes.new('ShaderNodeBsdfTransparent')
    mix = nt.nodes.new('ShaderNodeMixShader')
    nt.links.new(geo.outputs['Position'], sep.inputs[0])
    nt.links.new(sep.outputs['Z'], lt.inputs[0])
    nt.links.new(lvl.outputs[0], lt.inputs[1])
    nt.links.new(lt.outputs[0], mix.inputs['Fac'])
    nt.links.new(trn.outputs[0], mix.inputs[1])
    nt.links.new(em.outputs[0], mix.inputs[2])
    nt.links.new(mix.outputs[0], out.inputs['Surface'])
    return m


def set_uw_level(z):
    uw_material().node_tree.nodes['level'].outputs[0].default_value = z


def add_water_to_specs(L, uw_visible):
    """Every layer: WATER is a holdout; plus a 'mask_uw' layer (uw_visible collections, override material)."""
    L.specs = [(n, vis, hold + ['WATER'], ind) for n, vis, hold, ind in L.specs]
    L.add('mask_uw', uw_visible, override=uw_material())


# --------------------------------------------------------------------------- posing

def stabilize_head3(rig, hp, hd):
    down, tilt, turn = ba.head_rot3(hp, hd)
    target = tr.q_axis((0, 0, 1), bc.DIR_YAW[hd] + turn) @ tr.q_axis((1, 0, 0), down) @ tr.q_axis((0, 1, 0), tilt)
    bpy.context.view_layer.update()
    parent = rig.j['neck'].matrix_world.to_quaternion()
    rig.j['head'].rotation_quaternion = parent.inverted() @ target
    bpy.context.view_layer.update()


def body_k(rig):
    """Size of this base relative to the adult (anchor-relative IK targets / ball / dig points scale with it)."""
    ch = rig.meta['ch']
    tz = rig.meta.get('torso_scale', (1, 1, 1))[2]
    return (ch.get('leg_len', 0.338) + 0.33 * tz) / (0.338 + 0.33)


def leg_scale(rig):
    B = tb.BASES[rig.meta['base']]
    return B['P']['leg'][2]


def sole(rig, n):
    return rig.world('knee_' + n, (0, -0.02, -0.20 * leg_scale(rig)))


def facing_rot(yaw):
    return Quaternion((0, 0, 1), math.radians(yaw))


def fvec(yaw, v):
    """Facing-frame vector (x = character's left, f = forward, z = up) -> world."""
    x, f, z = v
    return facing_rot(yaw) @ Vector((x, -f, z))


def place_body(rig, place, anchor):
    kind, z = place
    bpy.context.view_layer.update()
    tz = rig.meta.get('torso_scale', (1, 1, 1))[2]
    if kind == 'head':
        ref = rig.world('head', (0, 0, tb.HEAD_C))
    elif kind == 'ring':
        ref = rig.world('spine', (0, 0, 0.215 * tz))
    elif kind == 'hips':
        ref = rig.world('hips')
    elif kind == 'feet':
        ref = (sole(rig, 'R') + sole(rig, 'L')) * 0.5
    elif kind == 'lowest':
        h = rig.world('hips')
        lows = []
        for n in ('R', 'L'):
            lows.append(rig.world('knee_' + n).z - 0.058)
            lows.append(sole(rig, n).z)
            lows.append(rig.world('knee_' + n, (0, 0, -0.12 * leg_scale(rig))).z - 0.05)
        ref = Vector((h.x, h.y, min(lows)))
    else:
        raise ValueError(kind)
    delta = Vector((anchor.x - ref.x, anchor.y - ref.y, z - ref.z))
    rig.j['root'].location = rig.j['root'].location + delta
    bpy.context.view_layer.update()


def solve_world_arms(rig, ikw, yaw, anchor):
    bpy.context.view_layer.update()
    chest = rig.j['chest'].matrix_world
    inv = chest.inverted()
    crot = chest.to_quaternion().inverted()
    k = body_k(rig)
    ar = tb.BASES[rig.meta['base']]['P']['arm'][1]
    for side, (kind, v, pole) in ikw.items():
        if kind == 'sh':
            tgt = rig.world('sh_' + side) + fvec(yaw, tuple(c * ar for c in v))
        elif kind == 'anchor':
            tgt = anchor + fvec(yaw, tuple(c * k for c in v))
        elif kind == 'ring':
            a, up = v
            s = bp.ring_scale(rig.meta['ch']['age'])
            tx, ty, tz = rig.meta.get('torso_scale', (1, 1, 1))
            s *= 0.5 * (tx + ty)
            c = rig.world('spine', (0, 0, 0.215 * tz))
            R = bp.RING_R * s
            tgt = c + fvec(yaw, (R * math.sin(math.radians(a)), R * math.cos(math.radians(a)), bp.RING_r * s + up))
        else:
            raise ValueError(kind)
        pl = crot @ fvec(yaw, pole)
        rig.solve_arm(side, tuple(inv @ tgt), tuple(pl))
    bpy.context.view_layer.update()


def pose_body3(rig, anim, d, i, water_ob=None):
    """Pose one tile rig for (anim, dir, frame).  Returns the pose dict (with meta keys)."""
    p = ba.pose3(anim, i, rig.meta['ch'], d)
    hp = p['_hp']
    hd = p.get('_hd') or d
    yaw = bc.DIR_YAW[d] + p.get('_yaw', 0.0)
    push = p.get('_push')
    body_p = {k: v for k, v in p.items() if not k.startswith('_')}
    if push:
        body_p.pop('ik_R', None)
        body_p.pop('ik_L', None)
    tb.scale_ik(rig, body_p)
    rig.apply(body_p, yaw_deg=yaw)
    if push:
        tr2.solve_push(rig, d)
    stabilize_head3(rig, hp, hd)
    anchor = Vector(rig.rest_loc['root'])
    anchor.z = 0.0
    if p.get('_place'):
        place_body(rig, p['_place'], anchor)
        stabilize_head3(rig, hp, hd)
    if p.get('_ikw'):
        solve_world_arms(rig, p['_ikw'], yaw, anchor)
    info = {'yaw': yaw, 'board': p.get('_board'), 'anchor': anchor}
    if anim == 'float':
        info['ring_tilt'] = (3.0 * math.sin(TAU * i / 4), 2.5 * math.cos(TAU * i / 4))
    bp.place_items3(rig, info)
    tp2.place_items(rig)
    return p


TAU = math.tau


def cam_forward():
    rot = bpy.context.scene.camera.rotation_euler.to_matrix()
    return -(rot @ Vector((0.0, 0.0, 1.0))).normalized()


def depth(p):
    return p.dot(cam_forward())


def head_hit_depth(rig, p):
    """Depth of the first head-ellipsoid hit along the view ray through world point p (None = miss)."""
    fwd = cam_forward()
    hm = rig.j['head'].matrix_world
    c = hm @ Vector((0, 0, tb.HEAD_C))
    R = hm.to_3x3().normalized()
    rx, ry, rz = tb.HEAD_R
    o = R.transposed() @ (p - c)
    dv = R.transposed() @ fwd
    o = Vector((o.x / rx, o.y / ry, o.z / rz))
    dv = Vector((dv.x / rx, dv.y / ry, dv.z / rz))
    a = dv.dot(dv)
    b = 2 * o.dot(dv)
    cc = o.dot(o) - 1.0
    disc = b * b - 4 * a * cc
    if disc < 0:
        return None
    t = (-b - math.sqrt(disc)) / (2 * a)
    return depth(p) + t


def limb_front(rig):
    """{limb: True} for limbs that are (mostly) in FRONT of the head where they overlap it on screen."""
    out = set()
    for side in ('R', 'L'):
        sh, el, hd_ = rig.world('sh_' + side), rig.world('el_' + side), rig.world('hand_' + side)
        arm_pts = [sh.lerp(el, t) for t in (0.3, 0.6, 1.0)] + [el.lerp(hd_, t) for t in (0.3, 0.6, 0.9)]
        for limb, pts in (('arm_' + side, arm_pts), ('hand_' + side, [hd_, hd_ + Vector((0, 0, 0.03))])):
            fr = bh = 0
            for p in pts:
                hit = head_hit_depth(rig, p)
                if hit is None:
                    continue
                if depth(p) < hit - 0.01:
                    fr += 1
                else:
                    bh += 1
            if fr > bh:
                out.add(limb)
    if 'hand_R' in out:
        out.add('arm_R') if any(x in out for x in ('arm_R',)) else None
    return out


# --------------------------------------------------------------------------- meta

def px(p, anchor):
    return tr.px_off(p - anchor)


def body_meta3(rig, base, bdir):
    """headOffset for the new anim frames, zfront, ballPoint / digPoint / splashPoint, shadow hints, tiles."""
    meta = {'base': base, 'anchor': [ANCHOR[0] / FRAME, ANCHOR[1] / FRAME], 'headAnchor': list(HEAD_ANCHOR),
            'headOffset': {}, 'headOffsetF': {}, 'zfront': {}, 'ballPoint': {}, 'digPoint': {}, 'splashPoint': {},
            'shadow': {}, 'handsF': {}}
    root0 = rig.rest_loc['root'].copy()
    rig.rest_loc['root'] = Vector((0, 0, 0))
    anchor = Vector((0, 0, 0))
    k = body_k(rig)
    for anim, d, i in ba.frames3():
        p = pose_body3(rig, anim, d, i)
        key = f'{anim}_{d}_{i}'
        off = tr.px_off(rig.j['head'].matrix_world.translation)
        meta['headOffsetF'][key] = [round(off[0], 2), round(off[1], 2)]
        meta['headOffset'][key] = [int(round(off[0])), int(round(off[1]))]
        meta['zfront'][key] = sorted(limb_front(rig))
        yaw = bc.DIR_YAW[d] + p.get('_yaw', 0.0)
        if p.get('_ball') is not None:
            hr, hl = rig.world('hand_R'), rig.world('hand_L')
            bcen = (hr + hl) * 0.5
            chest = rig.world('chest')
            o = tr.px_off(bcen)
            meta['ballPoint'][key] = [round(o[0], 1), round(o[1], 1), bool(depth(bcen) < depth(chest) - 0.02),
                                      round(ba.BALL_R * k * bc.PPU, 1)]
        if anim == 'dig' and i == 0:
            o = tr.px_off(fvec(yaw, tuple(c * k for c in ba.DIG_POINT)))
            meta['digPoint'][d] = [round(o[0], 1), round(o[1], 1)]
        if anim == 'splash_play' and i == 0:
            o = tr.px_off(fvec(yaw, tuple(c * k for c in ba.SPLASH_POINT)))
            meta['splashPoint'][d] = [round(o[0], 1), round(o[1], 1)]
        if anim == 'sunbathe' and i == 0:
            h, nk = rig.world('hips'), rig.world('neck')
            ft = (sole(rig, 'R') + sole(rig, 'L')) * 0.5
            a_, b_ = Vector((ft.x, ft.y, 0)), Vector((nk.x, nk.y, 0)) + (Vector((nk.x, nk.y, 0)) - Vector((h.x, h.y, 0))) * 0.6
            ca = tr.px_off((a_ + b_) * 0.5)
            pa, pb = tr.px_off(a_), tr.px_off(b_)
            ln = math.hypot(pb[0] - pa[0], pb[1] - pa[1])
            meta['shadow'][d] = {'center': [round(ca[0], 1), round(ca[1], 1)], 'length': round(ln + 18, 1),
                                 'width': round(0.42 * k * bc.PPU * 0.5 + 6, 1),
                                 'angleDeg': round(math.degrees(math.atan2(pb[1] - pa[1], pb[0] - pa[0])), 1)}
        if anim in ('swim', 'float'):
            hr, hl = rig.world('hand_R'), rig.world('hand_L')
            meta['handsF'][key] = [round(v, 1) for v in tr.px_off(hr) + tr.px_off(hl)] + [round(hr.z, 3),
                                                                                         round(hl.z, 3)]
    meta['tiles'] = {a: tile_of(a) for a in list(ba.ORDER3) + list(ba.OLD_ANIMS)}
    meta['k'] = round(k, 3)
    meta['water'] = {'swimHeadZ': ba.SWIM_HEAD_Z, 'floatRingZ': ba.FLOAT_RING_Z, 'splashDepth': ba.SPLASH_DEPTH,
                     'boardTop': ba.BOARD_TOP}
    rig.rest_loc['root'] = root0
    with open(os.path.join(bdir, 'meta3.json'), 'w') as fh:
        json.dump(meta, fh, indent=1)
    return meta


# --------------------------------------------------------------------------- body

def base_parts3(base):
    age = tb.BASES[base]['age']
    return [p for p in bp.NEW_BODY if (tp.PARTS[p].ages is None or age in tp.PARTS[p].ages) and tp.PARTS[p].subs]


def layer_anims(layer):
    if layer in tr.LIMB_LAYERS or layer in ('mask', 'mask_uw'):
        return None
    return bpr.PART_ANIMS.get(layer.split('.')[0], [])


def render_groups3(opt, base, parts, groups, tile, new, t0, water_used):
    ctx = tb.Ctx('layer')
    rig, ch = tr.build(ctx, base, parts)
    wat = water_block(ctx)
    bdir = os.path.join(opt['cache'], 'body', base)
    os.makedirs(bdir, exist_ok=True)
    if new and not os.path.exists(os.path.join(bdir, 'meta3.json')):
        sc, cam = tr.setup_scene(int(opt['samples']))
        body_meta3(rig, base, bdir)
    tw, th = tile['w'], tile['h']
    tx = tr.TILE_X * (tw / 128.0)
    ty = tr.TILE_Y * (th / 128.0)
    rigs = tr.make_tiles(rig, tr.BODY_COLS * tr.BODY_ROWS, tr.BODY_COLS, tx=tx, ty=ty)
    sc, cam = tr.setup_scene(int(opt['samples']), (ANCHOR[0] - tile['ox'], ANCHOR[1]), tr.BODY_COLS * tw,
                             tr.BODY_ROWS * th)
    sc.cycles.transparent_max_bounces = 32
    L = tr.Layers(ctx)
    mq = ['M_core'] + tr.MQ_LIMBS
    if new:
        for lname, cname in tr.LIMB_LAYERS.items():
            L.add(lname, [cname], holdout=[c for c in mq if c != cname], indirect=['M_head_none'])
    L.add('mask', mq + ['M_head_none'])
    allparts = []
    for pn in parts:
        cols = tr.part_sub_cols(ctx, pn)
        for s, cname in cols.items():
            sibs = [c for c in cols.values() if c != cname]
            L.add(f'{pn}.{s}', [cname], holdout=mq + sibs, indirect=['M_head_none'])
            allparts.append(cname)
    if water_used:
        add_water_to_specs(L, mq + ['M_head_none'] + allparts)
    L.realize()
    names = [s_[0] for s_ in L.specs]
    print(f'[{base}] tile {tw}x{th}: {len(groups)} groups x {len(names)} layers ({len(parts)} parts)', flush=True)
    for anim, d in groups:
        outdir = os.path.join(bdir, f'{anim}_{d}')
        water = anim in ba.WATER_ANIMS
        want = []
        for n in names:
            la = layer_anims(n)
            if n == 'mask_uw' and not water:
                continue
            if n in tr.LIMB_LAYERS and not new:
                continue
            if la is not None and anim not in la:
                continue
            want.append(n)
        todo = want if opt['force'] else [n for n in want if n not in tr.done_layers(outdir, want)]
        if not todo:
            continue
        set_water(wat, water, 0.0)
        set_uw_level(0.0)
        n = ba.anim_info(anim)['frames']
        for i, r_ in enumerate(rigs):
            pose_body3(r_, anim, d, min(i, n - 1))
        L.render(outdir, set(todo))
        print(f'[{base}] {anim}_{d}: {len(todo)} layers  {time.time() - t0:.0f}s', flush=True)


def render_body(opt):
    t0 = time.time()
    for base in sel(opt['bases'], tb.BASE_ORDER):
        if base not in tr.tb.BASE_ORDER or base not in ('child_slim', 'adult_slim', 'elder_slim'):
            continue
        parts = base_parts3(base)
        if opt['parts'] != 'all':
            parts = [p for p in parts if p in opt['parts'].split(',')]
        sets = []
        if opt['set'] in ('new', 'all'):
            sets.append((True, [a for a in ba.ORDER3]))
        if opt['set'] in ('old', 'all'):
            sets.append((False, list(ba.OLD_ANIMS)))
        for new, anims in sets:
            groups = [(a, d) for a in anims for d in ba.anim_info(a)['dirs']
                      if (opt['anims'] == 'all' or a in opt['anims'].split(','))
                      and (opt['dirs'] == 'all' or d in opt['dirs'].split(','))]
            groups = [g_ for g_ in groups if any(g_[0] in bpr.PART_ANIMS.get(p, []) for p in parts) or new]
            if opt['reverse']:
                groups = groups[::-1]
            by_tile = {}
            for g_ in groups:
                by_tile.setdefault(tuple(sorted(tile_of(g_[0]).items())), []).append(g_)
            for tk, gs in by_tile.items():
                water_used = any(a in ba.WATER_ANIMS for a, _ in gs)
                render_groups3(opt, base, parts, gs, dict(tk), new, t0, water_used)
        print(f'[{base}] {opt["set"]} done {time.time() - t0:.0f}s', flush=True)


def render_meta(opt):
    for base in sel(opt['bases'], tb.BASE_ORDER):
        if base not in ('child_slim', 'adult_slim', 'elder_slim'):
            continue
        ctx = tb.Ctx('layer')
        rig, ch = tr.build(ctx, base, ['swim_ring_worn', 'surfboard', 'toy_spade'])
        sc, cam = tr.setup_scene(6)
        bdir = os.path.join(opt['cache'], 'body', base)
        os.makedirs(bdir, exist_ok=True)
        m = body_meta3(rig, base, bdir)
        print(base, 'k', m['k'], 'dig', m['digPoint'], 'splash', m['splashPoint'], flush=True)


# --------------------------------------------------------------------------- head

class ChunkLayers(tr.Layers):
    """tf_render.Layers spread over several linked copies of the scene (`chunk` view layers each).

    Why: setting LayerCollection.exclude runs BKE_view_layer_find_from_collection(), which walks every view layer
    of the scene - realizing N view layers x C collections in ONE scene costs ~N^2 C^2 (the ~350-layer beach head
    scene needed hours just to set up).  Linked scene copies share every object / collection / material, the
    camera and all render settings (Scene.copy() made before any view layer is added), so the layers come out
    exactly as tf_render.Layers would render them; render() runs one render per scene that has wanted layers."""

    def __init__(self, ctx, chunk=24):
        super().__init__(ctx)
        self.chunk = max(1, int(chunk))
        self.scenes = []          # [(scene, [layer names], file output node)]

    def realize(self):
        main = self.sc
        allc = set(self.ctx.cols)
        groups = [self.specs[k:k + self.chunk] for k in range(0, len(self.specs), self.chunk)]
        scenes = [main] + [main.copy() for _ in groups[1:]]           # copies first: 1 view layer each
        for k, (sc, specs) in enumerate(zip(scenes, groups)):
            if sc is not main:
                sc.name = f'bf_chunk_{k:02d}'
            first = True
            for name, vis, hold, ind in specs:
                if first:
                    vl = sc.view_layers[0]
                    vl.name = name
                    first = False
                else:
                    vl = sc.view_layers.new(name)
                if name in self.overrides:
                    vl.material_override = self.overrides[name]
                for cname in allc:
                    lc = vl.layer_collection.children.get(cname)
                    if lc is None:
                        continue
                    if cname in vis:
                        lc.exclude = False
                    elif cname in hold:
                        lc.exclude = False
                        lc.holdout = True
                    elif cname in ind:
                        lc.exclude = False
                        lc.indirect_only = True
                    else:
                        lc.exclude = True
            tree = bpy.data.node_groups.new(f'bf_comp_{k:02d}', 'CompositorNodeTree')
            sc.compositing_node_group = tree
            fo = tree.nodes.new('CompositorNodeOutputFile')
            fo.format.media_type = 'IMAGE'
            fo.format.file_format = 'PNG'
            fo.format.color_mode = 'RGBA'
            fo.format.color_depth = '8'
            fo.file_name = ''
            for name, *_ in specs:
                rl = tree.nodes.new('CompositorNodeRLayers')
                rl.scene = sc
                rl.layer = name
                fo.file_output_items.new('RGBA', name)
                tree.links.new(rl.outputs['Image'], fo.inputs[name])
            self.scenes.append((sc, [s_[0] for s_ in specs], fo))
            print(f'[chunk] scene {k + 1}/{len(groups)}: {len(specs)} view layers', flush=True)
        self.tree, self.fo = self.scenes[0][2].id_data, self.scenes[0][2]

    def render(self, outdir, only=None):
        os.makedirs(outdir, exist_ok=True)
        for sc, names, fo in self.scenes:
            want = [n for n in names if only is None or n in only]
            if not want:
                continue
            for vl in sc.view_layers:
                vl.use = vl.name in want
            fo.directory = outdir + os.sep
            bpy.ops.render.render(write_still=False, scene=sc.name)
        missing = [n for n in (only or [s[0] for s in self.specs]) if not os.path.exists(os.path.join(outdir, n + '.png'))]
        if missing:
            raise RuntimeError(f'missing outputs in {outdir}: {missing[:5]}')


def pose_head_only3(rig, hp, d):
    rig.apply({}, yaw_deg=0.0)
    stabilize_head3(rig, hp, d)


def head_todo3(names, hp, d):
    """Layers wanted for head frame (hp, d)."""
    out = []
    new_pose = hp in ba.HEAD_POSES3
    fdirs = ba.face_dirs(hp)
    for n in names:
        if n in ('head.none', 'mask_uw'):
            if n == 'mask_uw' and hp != 'swim':
                continue
            out.append(n)
            continue
        if n.startswith('face.') or n.startswith('brow.'):
            if d not in fdirs:
                continue
            kind, fs, x = n.split('.')
            if new_pose:
                if kind == 'face' and x in ba.NEW_POSE_EXPRS[hp]:
                    out.append(n)
                elif kind == 'brow' and x in ta.BROW_SHAPES and x != 'sad':
                    out.append(n)
            elif kind == 'face' and x in ba.FACE_EXPR3 and hp in ba.NEW_EXPR_POSES[x]:
                out.append(n)
            continue
        if n.startswith('head.'):
            if new_pose:
                out.append(n)
            continue
        pn = n.split('.')[0]
        if new_pose or pn in bp.NEW_HEAD:
            out.append(n)
    return out


def render_head(opt):
    t0 = time.time()
    parts = V4_HEAD + bp.NEW_HEAD
    if opt['parts'] != 'all':
        parts = [p for p in parts if p in opt['parts'].split(',')]
    face_sets = list(tb.FACE_SETS)
    ctx = tb.Ctx('layer')
    rig, ch = tr.build(ctx, 'adult_slim', parts, face_sets)
    wat = water_block(ctx)
    sc, cam = tr.setup_scene(int(opt['samples']), HEAD_ANCHOR)
    sc.cycles.transparent_max_bounces = 32
    L = ChunkLayers(ctx, int(opt['chunk']))
    tr.head_layer_specs(L, ctx, parts, face_sets)
    head_cols = [c for c in ctx.cols if c.startswith('P.') or c == 'M_head_none']
    add_water_to_specs(L, head_cols)
    L.realize()
    names = [s_[0] for s_ in L.specs]
    hdir = os.path.join(opt['cache'], 'head')
    os.makedirs(hdir, exist_ok=True)
    frames = []
    if opt['frames'] in ('new', 'all'):
        frames += ba.head_frames3()
    if opt['frames'] in ('old', 'all'):
        frames += ta2.all_head_frames()
    if opt['dirs'] != 'all':
        frames = [f for f in frames if f[1] in opt['dirs'].split(',')]
    if opt['reverse']:
        frames = frames[::-1]
    meta = {'anchor': list(HEAD_ANCHOR), 'layout': 'dirs', 'frames': [f'{hp}_{d}' for hp, d in ba.all_head_frames()],
            'layers': names, 'newHeadParts': bp.NEW_HEAD, 'newPoses': list(ba.HEAD_POSES3),
            'swimHeadCut': ba.SWIM_HEAD_CUT}
    with open(os.path.join(hdir, 'meta.json'), 'w') as f:
        json.dump(meta, f, indent=1)
    print(f'[head3] {len(frames)} frames, {len(names)} layers in scene', flush=True)
    for k, (hp, d) in enumerate(frames):
        outdir = os.path.join(hdir, f'{hp}_{d}')
        want = head_todo3(names, hp, d)
        todo = want if opt['force'] else [n for n in want if n not in tr.done_layers(outdir, want)]
        if not todo:
            continue
        pose_head_only3(rig, hp, d)
        hc = rig.world('head', (0, 0, tb.HEAD_C))
        zw = hc.z - ba.SWIM_HEAD_CUT
        set_water(wat, hp == 'swim', zw)
        set_uw_level(zw if hp == 'swim' else -99.0)
        tr.aim_camera(cam, rig.j['head'].matrix_world.translation.copy(), HEAD_ANCHOR)
        L.render(outdir, set(todo))
        print(f'[head3] {k + 1}/{len(frames)} {hp}_{d}: {len(todo)} layers  {time.time() - t0:.0f}s', flush=True)
    print(f'[head3] done in {time.time() - t0:.0f}s', flush=True)


# --------------------------------------------------------------------------- full (look-dev / proof)

def render_full(opt):
    t0 = time.time()
    if opt['combos'] == 'look':
        combos = [dict(c, frames=bpr.LOOK_FRAMES) for c in bpr.LOOK]
    elif opt['combos'] == 'jobs':
        combos = [dict(c, frames=bpr.LOOK_JOB_FRAMES) for c in bpr.LOOK_JOBS]
    else:
        combos = json.load(open(opt['combos']))
    out_root = opt['out'] or os.path.join(opt['cache'], 'full')
    for cb_ in combos:
        if opt['look'] != 'all' and cb_['name'] not in opt['look'].split(','):
            continue
        outdir = os.path.join(out_root, cb_['name'])
        frames = [tuple(f) for f in cb_['frames']]
        if opt['anims'] != 'all':
            frames = [f for f in frames if f[0] in opt['anims'].split(',')]
        todo = [f for f in frames if opt['force'] or not os.path.exists(os.path.join(outdir, '%s_%s_%d.png' % f))]
        if opt.get('strict'):
            todo = [f for f in todo if all(f[0] in bpr.PART_ANIMS.get(p, ba.OLD_ANIMS) for p in cb_['parts']
                                           if tp.PARTS[p].space == 'body' and tp.PARTS[p].subs)]
        if not todo:
            continue
        parts = list(cb_['parts'])
        for a, props in bpr.ANIM_PARTS.items():
            if any(f[0] == a for f in todo):
                parts += [p for p in props if p not in parts]
        ctx = tb.Ctx('full', dict(cb_['colors']))
        for slot, pal in bpr.SLOT_PALETTE3.items():
            ctx.colors.setdefault(slot, bpr.PALETTES3[pal][0])
        hat = any(tp.PARTS[p].family == 'hat' and tp.PARTS[p].cls == 'full' for p in parts)
        rig, ch = tr.build(ctx, cb_['base'], parts, (cb_['face'],), hat_variants=hat)
        wat = water_block(ctx)
        root0 = rig.rest_loc['root'].copy()
        sc, cam = tr.setup_scene(int(opt['samples']), ANCHOR, FRAME, FRAME)
        vl = sc.view_layers[0]
        fs = cb_['face']
        os.makedirs(outdir, exist_ok=True)
        for anim, d, i in todo:
            tl = ba.pose3(anim, i, rig.meta['ch'], d)
            for cname in ctx.cols:
                lc = vl.layer_collection.children.get(cname)
                if cname == 'WATER':
                    lc.exclude = False
                    lc.holdout = True
                    continue
                keep = cname in ('M_core', f'M_head_{cb_["nose"]}') or cname in tr.MQ_LIMBS or cname.startswith('P.')
                if cname.startswith('P.'):
                    pn = cname.split('.')[1]
                    is_hat = cname.endswith('~hat')
                    if tp.PARTS[pn].hatfit:
                        keep = is_hat == hat
                    pa = bpr.PART_ANIMS.get(pn)
                    if pa is not None and anim not in pa:
                        keep = False
                    if pn not in cb_['parts'] and anim not in [a for a, ps in bpr.ANIM_PARTS.items() if pn in ps]:
                        keep = False
                    if pn in tp2.ITEM_NO_ANIMS and anim in tp2.ITEM_NO_ANIMS[pn]:
                        keep = False
                if cname.startswith('F_'):
                    want = {f'F_{fs}_{t}' for t in ta.FACE_EXPR[tl['_face']]}
                    want.add(f'F_{fs}_{ta.BROW_SHAPES[tl["_brow"]]}')
                    want.add(f'F_{fs}_lines')
                    keep = cname in want and d in ba.face_dirs(tl['_hp']) or (cname == f'F_{fs}_lines' and
                                                                             d in ba.face_dirs(tl['_hp']))
                lc.exclude = not keep
            rig.rest_loc['root'] = root0
            set_water(wat, anim in ba.WATER_ANIMS, 0.0)
            pose_body3(rig, anim, d, i)
            bc.render_to(os.path.join(outdir, f'{anim}_{d}_{i}.png'))
        print(f'[full3] {cb_["name"]} {len(todo)} frames  {time.time() - t0:.0f}s', flush=True)


def main():
    opt = parse_args()
    os.makedirs(opt['cache'], exist_ok=True)
    {'head': render_head, 'body': render_body, 'meta': render_meta, 'full': render_full}[opt['mode']](opt)


if __name__ == '__main__':
    main()
