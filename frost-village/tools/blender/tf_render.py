"""
tf_render.py - render the townfolk paper-doll layers (CONTRACT_V4 J) with Blender Cycles.

Re-run (build machine, bpy module):
    /tmp/bvenv/bin/python tools/blender/tf_render.py -- --mode head
    /tmp/bvenv/bin/python tools/blender/tf_render.py -- --mode body --bases all
    /tmp/bvenv/bin/python tools/blender/tf_render.py -- --mode full --combos proof     (reference renders)
On a PC with Blender:  blender -b -P tools/blender/tf_render.py -- --mode head

Options (after the literal --):
    --mode     head | body | full
    --bases    all | comma list (tf_body.BASE_ORDER)           (body / full)
    --parts    all | comma list of part names (others are left out of the scene)
    --anims    all | comma list    --dirs all | S,SE,..   --frames all | 0,3
    --samples  16                  --cache /tmp/fv_cache/townfolk
    --force    re-render existing layer PNGs (default: resumable, only missing layers render)
    --combos   proof | path to a json list (full mode)

How a layer is rendered: every layer is one Blender view layer of the same scene, so a
single render() call writes all of them (compositor File Output, one PNG per layer).
  body layers: the part's sub collection is visible; the mannequin core / arms / hands and
               the part's sibling subs are HOLDOUTS (cut what they hide, still cast shadows);
               the head is 'indirect only' (casts its shadow on collars, never hides them).
  head layers: rendered once per (head pose, dir) with the head pivot on pixel HEAD_ANCHOR;
               the head ellipsoid (+ears) is the holdout.
Output: <cache>/head/<pose>_<dir>/<layer>.png, <cache>/body/<base>/<anim>_<dir>_<i>/<layer>.png,
<cache>/body/<base>/meta.json (headOffset per frame, carryPoint, shadow), <cache>/full/<combo>/...
Then: python3 tools/blender/tf_pack.py && python3 tools/blender/tf_check.py
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
from mathutils import Vector, Quaternion     # noqa: E402

import bl_common as bc                       # noqa: E402
import char_geo as g                         # noqa: E402
import tf_anim as ta                         # noqa: E402
import tf_body as tb                         # noqa: E402
import tf_parts as tp                        # noqa: E402

FRAME = 128
ANCHOR = (64, 104)
HEAD_ANCHOR = (64, 72)
DEFAULT_CACHE = '/tmp/fv_cache/townfolk'
NOSES = ('none', 'dot', 'big', 'button')
MQ_LIMBS = ['M_arm_R', 'M_arm_L', 'M_hand_R', 'M_hand_L']
LIMB_LAYERS = {'arm_R': 'M_arm_R', 'arm_L': 'M_arm_L', 'hand_R': 'M_hand_R', 'hand_L': 'M_hand_L'}


def parse_args():
    a = bc.script_args()
    opt = {'mode': 'head', 'bases': 'all', 'parts': 'all', 'anims': 'all', 'dirs': 'all', 'frames': 'all',
           'samples': '16', 'cache': DEFAULT_CACHE, 'force': False, 'combos': 'proof', 'faces': 'all',
           'frameset': 'all'}
    i = 0
    while i < len(a):
        k = a[i].lstrip('-')
        if k in ('force',):
            opt[k] = True
            i += 1
        else:
            opt[k] = a[i + 1]
            i += 2
    return opt


def sel(spec, full):
    return list(full) if spec == 'all' else [x for x in spec.split(',') if x in full]


# --------------------------------------------------------------------------- scene

def setup_scene(samples, anchor=ANCHOR):
    sc = bc.setup_render(FRAME, FRAME, samples=samples, denoise=True)
    sc.cycles.max_bounces = 4
    sc.cycles.diffuse_bounces = 2
    sc.cycles.glossy_bounces = 2
    sc.cycles.transmission_bounces = 2
    sc.cycles.transparent_max_bounces = 4
    sc.cycles.adaptive_threshold = 0.02
    # OIDN 'BALANCED' without prefilter: 3x faster per layer than HIGH/ACCURATE, same look
    # (mean abs diff vs a 256-sample reference 2.1 vs 2.0 levels)
    sc.cycles.denoising_quality = 'BALANCED'
    sc.cycles.denoising_prefilter = 'NONE'
    sc.render.use_persistent_data = True
    sc.render.compositor_device = 'CPU'
    cam = bc.setup_camera(FRAME, FRAME, anchor)
    bc.setup_lighting()
    return sc, cam


def aim_camera(cam, target, anchor):
    big = float(FRAME)
    cam.data.shift_x = -(anchor[0] - FRAME / 2.0) / big
    cam.data.shift_y = (anchor[1] - FRAME / 2.0) / big
    back = cam.rotation_euler.to_matrix() @ Vector((0.0, 0.0, 1.0))
    cam.location = Vector(target) + back * 60.0


def build(ctx, base, parts, face_sets=(), hat_variants=True):
    """Scene with the mannequin, face sets and the given parts, proportioned for `base`."""
    bc.reset_scene()
    rig = tb.build_rig()
    tb.build_mannequin(rig, ctx, noses=NOSES)
    for fs in face_sets:
        tb.build_face_set(rig, ctx, fs)
    for pn in parts:
        tp.build_part(rig, ctx, pn)
    bpy.context.view_layer.update()
    if hat_variants:
        for pn in parts:
            if tp.PARTS[pn].hatfit:
                tp.hat_clip(rig, ctx, pn)
    if ctx.mode == 'layer':
        make_diffuse_only(ctx, parts)
    ch = tb.apply_base(rig, base)
    rig.toggles.clear()          # visibility is driven by collections, never by Rig.apply
    return rig, ch


def make_diffuse_only(ctx, parts):
    """Layer renders of glossy subs (hair) drop their specular: it goes to the '.sheen' layer."""
    done = {}
    for pn in parts:
        for sname, sd in tp.PARTS[pn].subs.items():
            if not sd.get('sheen'):
                continue
            for suffix in ('', '~hat'):
                c = ctx.cols.get(f'P.{pn}.{sname}{suffix}')
                if c is None:
                    continue
                for o in c.objects:
                    for slot in o.material_slots:
                        m = slot.material
                        if m is None:
                            continue
                        if m.name not in done:
                            mm = m.copy()
                            bsdf = mm.node_tree.nodes.get('Principled BSDF')
                            if bsdf:
                                bsdf.inputs['Specular IOR Level'].default_value = 0.0
                            done[m.name] = mm
                        slot.material = done[m.name]


_SHEEN_MAT = {}


def sheen_material():
    if 'm' not in _SHEEN_MAT:
        m = bpy.data.materials.new('tf_sheen')
        m.use_nodes = True
        b = m.node_tree.nodes.get('Principled BSDF')
        b.inputs['Base Color'].default_value = (0, 0, 0, 1)
        b.inputs['Roughness'].default_value = 0.42
        _SHEEN_MAT['m'] = m
    return _SHEEN_MAT['m']


def q_axis(axis, deg):
    return Quaternion(Vector(axis), math.radians(deg))


def stabilize_head(rig, hp, d):
    down, tilt, turn = ta.head_rot(hp, d)
    target = q_axis((0, 0, 1), bc.DIR_YAW[d] + turn) @ q_axis((1, 0, 0), down) @ q_axis((0, 1, 0), tilt)
    bpy.context.view_layer.update()
    parent = rig.j['neck'].matrix_world.to_quaternion()
    rig.j['head'].rotation_quaternion = parent.inverted() @ target
    bpy.context.view_layer.update()


def pose_body(rig, anim, d, i):
    p = ta.pose(anim, i, rig.meta['ch'], d)
    hp = p['_hp']
    p = {k: v for k, v in p.items() if not k.startswith('_')}
    tb.scale_ik(rig, p)
    rig.apply(p, yaw_deg=bc.DIR_YAW[d])
    stabilize_head(rig, hp, d)
    return hp


def pose_head_only(rig, hp, d):
    rig.apply({}, yaw_deg=0.0)
    stabilize_head(rig, hp, d)


def px_off(p, anchor=ANCHOR):
    px = bc.world_to_pixel(tuple(p), FRAME, FRAME, anchor)
    return [px[0] - anchor[0], px[1] - anchor[1]]


# --------------------------------------------------------------------------- view layers

class Layers:
    """Builds view layers from (name, visible, holdout, indirect) collection specs and one
    File Output compositor node that writes <dir>/<name>.png for each enabled layer."""

    def __init__(self, ctx):
        self.ctx = ctx
        self.sc = bpy.context.scene
        self.specs = []
        self.tree = None
        self.fo = None
        self.overrides = {}

    def add(self, name, visible, holdout=(), indirect=(), override=None):
        self.specs.append((name, list(visible), list(holdout), list(indirect)))
        if override is not None:
            self.overrides[name] = override

    def realize(self):
        sc = self.sc
        allc = set(self.ctx.cols)
        first = True
        for name, vis, hold, ind in self.specs:
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
        tree = bpy.data.node_groups.new('tf_comp', 'CompositorNodeTree')
        sc.compositing_node_group = tree
        fo = tree.nodes.new('CompositorNodeOutputFile')
        fo.format.media_type = 'IMAGE'
        fo.format.file_format = 'PNG'
        fo.format.color_mode = 'RGBA'
        fo.format.color_depth = '8'
        fo.file_name = ''
        for name, *_ in self.specs:
            rl = tree.nodes.new('CompositorNodeRLayers')
            rl.layer = name
            fo.file_output_items.new('RGBA', name)
            tree.links.new(rl.outputs['Image'], fo.inputs[name])
        self.tree, self.fo = tree, fo

    def render(self, outdir, only=None):
        """Render the enabled layers (all, or names in `only`) into outdir/<name>.png."""
        os.makedirs(outdir, exist_ok=True)
        for vl in self.sc.view_layers:
            vl.use = only is None or vl.name in only
        self.fo.directory = outdir + os.sep
        bpy.ops.render.render(write_still=False)
        # Blender names outputs <dir><name>.png ; make sure they exist
        missing = [n for n in (only or [s[0] for s in self.specs]) if not os.path.exists(os.path.join(outdir, n + '.png'))]
        if missing:
            raise RuntimeError(f'missing outputs in {outdir}: {missing[:5]}')


def part_sub_cols(ctx, pname, suffix=''):
    P = tp.PARTS[pname]
    return {s: f'P.{pname}.{s}{suffix}' for s in P.subs if f'P.{pname}.{s}{suffix}' in ctx.cols}


def body_layer_specs(L, ctx, parts):
    mq = ['M_core'] + MQ_LIMBS
    for lname, cname in LIMB_LAYERS.items():
        L.add(lname, [cname], holdout=[c for c in mq if c != cname], indirect=['M_head_none'])
    L.add('mask', mq + ['M_head_none'])
    for pn in parts:
        cols = part_sub_cols(ctx, pn)
        for s, cname in cols.items():
            sibs = [c for c in cols.values() if c != cname]
            L.add(f'{pn}.{s}', [cname], holdout=mq + sibs, indirect=['M_head_none'])


def head_layer_specs(L, ctx, parts, face_sets, with_face=True):
    hold = ['M_head_none']
    for nose in NOSES:
        L.add(f'head.{nose}', [f'M_head_{nose}'])
    if with_face:
        for fs in face_sets:
            lines = [f'F_{fs}_lines'] if f'F_{fs}_lines' in ctx.cols else []
            for expr, togs in ta.FACE_EXPR.items():
                L.add(f'face.{fs}.{expr}', [f'F_{fs}_{t}' for t in togs] + lines, holdout=hold)
            for shape, tog in ta.BROW_SHAPES.items():
                L.add(f'brow.{fs}.{shape}', [f'F_{fs}_{tog}'], holdout=hold)
    for pn in parts:
        for suffix in ('', '~hat'):
            cols = part_sub_cols(ctx, pn, suffix)
            for s, cname in cols.items():
                sibs = [c for c in cols.values() if c != cname]
                L.add(f'{pn}.{s}{suffix}', [cname], holdout=hold + sibs)
                if tp.PARTS[pn].subs[s].get('sheen'):
                    L.add(f'{pn}.{s}{suffix}.sheen', [cname], holdout=hold + sibs, override=sheen_material())


# --------------------------------------------------------------------------- modes

def done_layers(outdir, names):
    return {n for n in names if os.path.exists(os.path.join(outdir, n + '.png'))}


def render_head(opt):
    t0 = time.time()
    parts = sel(opt['parts'], [p.name for p in tp.head_parts()])
    face_sets = sel(opt['faces'], list(tb.FACE_SETS))
    ctx = tb.Ctx('layer')
    rig, ch = build(ctx, 'adult_slim', parts, face_sets)
    sc, cam = setup_scene(int(opt['samples']), HEAD_ANCHOR)
    L = Layers(ctx)
    head_layer_specs(L, ctx, parts, face_sets)
    L.realize()
    names = [s[0] for s in L.specs]
    frames = ta.head_frames()
    dirs = sel(opt['dirs'], ta.LOCO_DIRS)
    frames = [(hp, d) for hp, d in frames if d in dirs]
    print(f'[head] {len(frames)} head frames x {len(names)} layers', flush=True)
    for k, (hp, d) in enumerate(frames):
        outdir = os.path.join(opt['cache'], 'head', f'{hp}_{d}')
        want = [n for n in names if (d in ta.FACE_DIRS or not (n.startswith('face.') or n.startswith('brow.')))]
        todo = want if opt['force'] else [n for n in want if n not in done_layers(outdir, want)]
        if not todo:
            continue
        pose_head_only(rig, hp, d)
        hw = rig.j['head'].matrix_world.translation.copy()
        aim_camera(cam, hw, HEAD_ANCHOR)
        L.render(outdir, set(todo))
        print(f'[head] {k + 1}/{len(frames)} {hp}_{d}: {len(todo)} layers  {time.time() - t0:.0f}s', flush=True)
    meta = {'anchor': list(HEAD_ANCHOR), 'frames': [f'{hp}_{d}' for hp, d in ta.head_frames()],
            'layers': names, 'face_frames': [list(x) for x in ta.face_frames()]}
    with open(os.path.join(opt['cache'], 'head', 'meta.json'), 'w') as f:
        json.dump(meta, f, indent=1)
    print(f'[head] done in {time.time() - t0:.0f}s', flush=True)


def body_meta(rig, base, outdir):
    """headOffset per frame, carryPoint per dir, shadow."""
    meta = {'base': base, 'anchor': [ANCHOR[0] / FRAME, ANCHOR[1] / FRAME], 'headAnchor': list(HEAD_ANCHOR),
            'shadow': tb.BASES[base]['shadow'], 'headOffset': {}, 'headOffsetF': {}}
    for anim, d, i in ta.all_frames():
        pose_body(rig, anim, d, i)
        off = px_off(rig.j['head'].matrix_world.translation)
        meta['headOffsetF'][f'{anim}_{d}_{i}'] = [round(off[0], 2), round(off[1], 2)]
        meta['headOffset'][f'{anim}_{d}_{i}'] = [int(round(off[0])), int(round(off[1]))]
    cp = {}
    for d in ta.ANIMS['carry_walk']['dirs']:
        pose_body(rig, 'carry_walk', d, 0)
        mid = (rig.world('hand_R') + rig.world('hand_L')) * 0.5
        mid.z += 0.05
        o = px_off(mid)
        cp[d] = [int(round(o[0])), int(round(o[1])), d in ('NE', 'N')]
    meta['carryPoint'] = cp
    with open(os.path.join(outdir, 'meta.json'), 'w') as f:
        json.dump(meta, f, indent=1)


def render_body(opt):
    t0 = time.time()
    parts = sel(opt['parts'], [p.name for p in tp.body_parts()])
    for base in sel(opt['bases'], tb.BASE_ORDER):
        ages = tb.BASES[base]['age']
        bparts = [pn for pn in parts if tp.PARTS[pn].ages is None or ages in tp.PARTS[pn].ages]
        ctx = tb.Ctx('layer')
        rig, ch = build(ctx, base, bparts)
        sc, cam = setup_scene(int(opt['samples']))
        L = Layers(ctx)
        body_layer_specs(L, ctx, bparts)
        L.realize()
        names = [s[0] for s in L.specs]
        bdir = os.path.join(opt['cache'], 'body', base)
        os.makedirs(bdir, exist_ok=True)
        body_meta(rig, base, bdir)
        frames = [(a, d, i) for a, d, i in ta.all_frames()
                  if (opt['frameset'] != 'proof' or (a, d, i) in PROOF_FRAMES)
                  and (opt['anims'] == 'all' or a in opt['anims'].split(','))
                  and (opt['dirs'] == 'all' or d in opt['dirs'].split(','))
                  and (opt['frames'] == 'all' or str(i) in opt['frames'].split(','))]
        print(f'[{base}] {len(frames)} frames x {len(names)} layers', flush=True)
        for k, (anim, d, i) in enumerate(frames):
            outdir = os.path.join(bdir, f'{anim}_{d}_{i}')
            todo = names if opt['force'] else [n for n in names if n not in done_layers(outdir, names)]
            if not todo:
                continue
            pose_body(rig, anim, d, i)
            L.render(outdir, set(todo))
            if k % 10 == 0:
                print(f'[{base}] {k + 1}/{len(frames)} {anim}_{d}_{i}: {len(todo)} layers  '
                      f'{time.time() - t0:.0f}s', flush=True)
        print(f'[{base}] done {time.time() - t0:.0f}s', flush=True)


# --------------------------------------------------------------------------- full reference renders

from tf_presets import PROOF_FRAMES, proof_combos      # noqa: E402


def render_full(opt):
    t0 = time.time()
    combos = proof_combos() if opt['combos'] == 'proof' else json.load(open(opt['combos']))
    for cb_ in combos:
        outdir = os.path.join(opt['cache'], 'full', cb_['name'])
        frames = [tuple(f) for f in cb_['frames']]
        todo = [f for f in frames if opt['force'] or not os.path.exists(os.path.join(outdir, '%s_%s_%d.png' % f))]
        if not todo:
            continue
        ctx = tb.Ctx('full', cb_['colors'])
        hat = any(tp.PARTS[p].family == 'hat' and tp.PARTS[p].cls == 'full' for p in cb_['parts'])
        rig, ch = build(ctx, cb_['base'], cb_['parts'], (cb_['face'],), hat_variants=hat)
        sc, cam = setup_scene(int(opt['samples']))
        vl = sc.view_layers[0]
        fs = cb_['face']
        for cname in ctx.cols:
            lc = vl.layer_collection.children.get(cname)
            keep = cname in ('M_core', f'M_head_{cb_["nose"]}') or cname in MQ_LIMBS or cname.startswith('P.')
            if cname.startswith('P.'):
                pn = cname.split('.')[1]
                is_hat = cname.endswith('~hat')
                if tp.PARTS[pn].hatfit:
                    keep = is_hat == hat
            lc.exclude = not keep
        os.makedirs(outdir, exist_ok=True)
        for anim, d, i in todo:
            hp = pose_body(rig, anim, d, i)
            tl = ta.pose(anim, i, rig.meta['ch'], d)
            want = {f'F_{fs}_{t}' for t in ta.FACE_EXPR[tl['_face']]}
            want.add(f'F_{fs}_{ta.BROW_SHAPES[tl["_brow"]]}')
            want.add(f'F_{fs}_lines')
            for cname in ctx.cols:
                if cname.startswith('F_'):
                    lc = vl.layer_collection.children.get(cname)
                    lc.exclude = cname not in want
            bc.render_to(os.path.join(outdir, f'{anim}_{d}_{i}.png'))
        print(f'[full] {cb_["name"]} {len(todo)} frames  {time.time() - t0:.0f}s', flush=True)


def main():
    opt = parse_args()
    os.makedirs(opt['cache'], exist_ok=True)
    if opt['mode'] == 'head':
        render_head(opt)
    elif opt['mode'] == 'body':
        render_body(opt)
    elif opt['mode'] == 'full':
        render_full(opt)
    else:
        raise SystemExit('unknown --mode ' + opt['mode'])


if __name__ == '__main__':
    main()
