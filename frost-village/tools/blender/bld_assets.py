"""
bld_assets.py - v3 buildings, construction stages and items for Frost Village
(docs/CONTRACT_V3.md section E).  Boats live in bld_boats.py.

Built with the SAME helpers, palette, camera, light and PPU as the base props: prop_lib,
prop_assets (shared sub-models) and life_assets (two-sided roof) are imported READ-ONLY and
never modified.  The registry BLD maps a build key to its builder + metadata; bld_render.py
renders it into /tmp/fv_cache/buildings and bld_pack.py packs assets/buildings/.

Conventions (same as prop_assets.py / life_assets.py)
  * 1 unit = 1 m, world origin = footprint centre = sprite anchor.
  * Builders model in a local frame whose front is -Y; bld_render parents everything to a root
    empty rotated by the spec's `yaw` (all buildings use yaw 0: front = screen down-left (SW),
    the +X side = screen down-right (SE); both of these faces are the ones the camera sees).
  * Snow sits on up-facing surfaces (snow slabs / the snowy() shader); roofs use the two-sided
    life_assets.roof() so BOTH slopes carry snow.
  * A builder may return
        {'idle': fn, 'work': fn(i), 'fx': {name: (x, y, z)}}            static building + 4-frame work loop
        {'frames': [(frame_name, setter)], 'sprites': {...}}            several states (construction stages)
        {'overlay': {'key': ..., 'at': (x, y, z)}}                      occluder overlay (see below)
  * mark(kind, loc, facing) records interaction points that become px offsets from the anchor:
        staff -> staffPoints/staffDirs   in -> inPoint   out -> outPoint   cash -> cashPoint
        customer -> customerPoint        dock -> dockPoint/dockDir        door -> doorPoint
        work -> workPoints/workDirs (builders at a site)   drop -> dropPoint (material pile)
  * Overlay: for a clerk who stands INSIDE a building behind a counter, bld_render also renders a
    mask of every surface on the camera side of a vertical plane through the clerk spot; bld_pack
    turns it into `<key>_front` (same frame + anchor).  Game: building (depth d), clerk (d + 0.5),
    overlay (d + 1) -> the counter correctly hides the clerk's legs.

Not run directly - see bld_render.py.
"""
import math
from collections import OrderedDict

import bpy  # noqa: F401  (import before mathutils when bpy is a module)
from mathutils import Vector, Euler

import prop_lib as L
from prop_lib import C, flat, snowy, tonal, box, cyl, sphere, blob, log, extrude, hexmix
import prop_assets as PA          # shared sub-models (crate, barrel, log pile, awning, lantern, fish ...)
import life_assets as LA          # roof() that handles both slopes, snow_drift()

BLD = OrderedDict()
MARKERS = []                      # (kind, empty, facing_local_vector or None)

ITEM_FRAME = (72, 72)
ITEM_ANCHOR = (36, 54)


def bld(key, kind, atlas, fp=None, yaw=0.0, shadow=True, samples=64, notes='', front=None, catcher=16.0,
        work=0, fps=8, item=None, sprites=None, extra=None):
    """Register a builder.  fp = footprint metres (a along local X, b along local Y) or ('r', radius).
    work = number of work frames (4) for an idle + anims.work building.  item = {'thickness': m}."""
    def deco(fn):
        BLD[key] = dict(key=key, fn=fn, kind=kind, atlas=atlas, fp=fp, yaw=yaw, shadow=shadow and not item,
                        samples=samples, notes=notes, front=front, catcher=catcher, work=work, fps=fps,
                        item=item, sprites=sprites, extra=extra or {})
        return fn
    return deco


# =========================================================================== helpers

def mark(kind, loc, facing=None, parent=None):
    """Interaction marker (an empty).  facing = local direction a character there looks toward."""
    em = bpy.data.objects.new('MK_%s_%d' % (kind, len(MARKERS)), None)
    bpy.context.scene.collection.objects.link(em)
    em.location = loc
    if parent is not None:
        em.parent = parent
    MARKERS.append((kind, em, None if facing is None else Vector(facing)))
    return em


def show(objs, on):
    for o in objs:
        o.hide_render = not on
        o.hide_viewport = not on


def descendants(objs):
    out = []
    for o in objs:
        out.append(o)
        out.extend(descendants(list(o.children)))
    return out


def top_level(objs):
    s = set(objs)
    return [o for o in objs if o.parent is None or o.parent not in s]


def regroup(objs, name, loc=(0, 0, 0), rot=(0, 0, 0)):
    """Parent the top-level objects of a Collect block to one empty (move / rotate a sub-assembly)."""
    return L.group(top_level(objs), name, loc=loc, rot=rot)


def gable_roof(name, W, D, eave_z, ridge_z, over, mat, snow_frac=(0.62, 0.62), seed=0, thick=0.1,
               ridge_col='#6B3526', x=0.0):
    """Two-sided gable roof along X (ridge at y = 0) whose eaves overhang the walls (+-D/2) by `over`;
    both slopes keep their snow (life_assets.roof).  Returns the list of objects."""
    slope = (ridge_z - eave_z) / (D / 2)
    z_out = eave_z - over * slope
    out = []
    with L.Collect() as c:
        LA.roof(name + 'F', W, -D / 2 - over, z_out, 0.0, ridge_z, thick, mat, snow_frac=snow_frac[0], seed=seed)
        LA.roof(name + 'B', W, D / 2 + over, z_out, 0.0, ridge_z, thick, mat, snow_frac=snow_frac[1], seed=seed + 1)
        log(name + '_ridge', 0.075, W + 0.1, (0, 0, ridge_z + 0.11), rot=(0, 90, 0), bark=flat(ridge_col, 0.8),
            end=flat(ridge_col, 0.8), segs=12)
        L.snow_slab(name + '_ridgesnow', W - 0.05, 0.3, 0.09, (0, 0, ridge_z + 0.12), seed=seed + 5)
    out = c.objs
    if x:
        for o in top_level(out):
            o.location.x += x
    return out


def gable_end(name, D, base_z, ridge_z, x, mat, thick=0.1):
    """Triangular plank gable at x (spans y in [-D/2, D/2])."""
    g = extrude(name, [(-D / 2, 0.0), (D / 2, 0.0), (0.0, ridge_z - base_z)], thick, rot=(90, 0, 90), top=mat,
                side=mat, bevel=0.02)
    g.location = (x - thick / 2, 0, base_z)
    return g


def plank_wall(name, size, loc, cols=('#E8D9BC', '#DCCAA8'), axis='Z', count=None, rough=0.82):
    """Box wall with horizontal painted planks (stripes along Z)."""
    n = count or max(3.0, size[2] / 0.22)
    m = L.stripes(cols[0], cols[1], n / max(size[2], 0.01), axis, rough=rough, soft=0.04)
    return box(name, size, loc, mat=m, bevel=0.025)


def window(name, loc, face, w=0.62, h=0.58, glow=1.9, shutters='#3D7CC9', frame='#5E3A22', sill_snow=True,
           cross=True, seed=9):
    """Glowing window on a wall face ('y-' = front, 'x+' = right side) at loc = centre on the wall surface."""
    x, y, z = loc
    fm = flat(frame, 0.8)
    wm = L.emissive(name + '_glass', '#FFE2A0', 'window', glow)
    objs = []
    if face == 'y-':
        objs.append(box(name + '_fr', (w + 0.16, 0.1, h + 0.16), (x, y - 0.02, z - h / 2 - 0.08), mat=fm, bevel=0.03))
        objs.append(box(name + '_gl', (w, 0.1, h), (x, y - 0.05, z - h / 2), mat=wm, bevel=0.01))
        if cross:
            objs.append(box(name + '_b1', (0.05, 0.11, h), (x, y - 0.07, z - h / 2), mat=fm, bevel=0.0))
            objs.append(box(name + '_b2', (w, 0.11, 0.05), (x, y - 0.07, z - 0.025), mat=fm, bevel=0.0))
        if sill_snow:
            objs.append(L.snow_slab(name + '_sill', w + 0.2, 0.18, 0.05, (x, y - 0.08, z - h - 0.1), seed=seed))
        if shutters:
            for s in (-1, 1):
                objs.append(box(name + '_sh', (w * 0.42, 0.06, h + 0.08), (x + s * (w / 2 + w * 0.24), y - 0.03,
                                                                            z - h / 2 - 0.04),
                                mat=flat(shutters, 0.7), bevel=0.02))
    else:
        objs.append(box(name + '_fr', (0.1, w + 0.16, h + 0.16), (x + 0.02, y, z - h / 2 - 0.08), mat=fm, bevel=0.03))
        objs.append(box(name + '_gl', (0.1, w, h), (x + 0.05, y, z - h / 2), mat=wm, bevel=0.01))
        if cross:
            objs.append(box(name + '_b1', (0.11, 0.05, h), (x + 0.07, y, z - h / 2), mat=fm, bevel=0.0))
            objs.append(box(name + '_b2', (0.11, w, 0.05), (x + 0.07, y, z - 0.025), mat=fm, bevel=0.0))
        if sill_snow:
            objs.append(L.snow_slab(name + '_sill', 0.18, w + 0.2, 0.05, (x + 0.08, y, z - h - 0.1), seed=seed))
        if shutters:
            for s in (-1, 1):
                objs.append(box(name + '_sh', (0.06, w * 0.42, h + 0.08), (x + 0.03, y + s * (w / 2 + w * 0.24),
                                                                            z - h / 2 - 0.04),
                                mat=flat(shutters, 0.7), bevel=0.02))
    return objs


def log_walls(W, D, wall_h, r=0.13, seed=1, cols=('#B5763F', '#A86A36', '#C08049'), over=0.18):
    """Interlocking log walls (as prop_assets.log_house) around a W x D rectangle; returns top z."""
    rnd = L.rng(seed)
    endm = L.end_grain()
    hc = r * 1.84
    n = int(round(wall_h / hc))
    for k in range(n):
        z = r + k * hc
        for sgn in (-1, 1):
            c = cols[(k + (sgn > 0)) % len(cols)]
            log('lx', r, W + 2 * over, (rnd.uniform(-0.03, 0.03), sgn * D / 2, z), rot=(0, 90, 0),
                bark=tonal(c, 0.1, 3.0), end=endm, segs=14)
            c = cols[(k + 1 + (sgn > 0)) % len(cols)]
            log('ly', r, D + 2 * over, (sgn * W / 2, rnd.uniform(-0.03, 0.03), z + hc / 2), rot=(90, 0, 0),
                bark=tonal(c, 0.1, 3.0), end=endm, segs=14)
    top = r + (n - 1) * hc + hc / 2 + r
    box('inner', (W - 0.1, D - 0.1, top), mat=flat('#8A5A33', 0.8), bevel=0.0)
    return top


# ---------------------------------------------------------------- small goods (shelves, conveyor, items)

def can_mat(label='#3D7CC9', stripe='#F4F1EA'):
    """Tin can: silver rims, coloured paper label with two thin cream stripes (object Z 0..1 = Generated)."""
    key = ('can', label, stripe)
    if key in L._CUSTOM:
        return L._CUSTOM[key]
    nb = L.NB('can_%s' % label.lstrip('#'), rough=0.45, metal=0.0)
    tc = nb.n('ShaderNodeTexCoord')
    sep = nb.n('ShaderNodeSeparateXYZ')
    nb.link(tc.outputs['Generated'], sep.inputs[0])
    z = sep.outputs['Z']
    lab = nb.math('MULTIPLY', nb.map_range(z, 0.13, 0.16), nb.map_range(z, 0.87, 0.84))
    st = nb.math('ADD', nb.math('MULTIPLY', nb.map_range(z, 0.2, 0.23), nb.map_range(z, 0.29, 0.26)),
                 nb.math('MULTIPLY', nb.map_range(z, 0.71, 0.74), nb.map_range(z, 0.8, 0.77)))
    col = nb.mix_rgb(lab, C('#C3CCD8'), C(label))
    col = nb.mix_rgb(st, col, C(stripe))
    nb.base(col)
    met = nb.math('SUBTRACT', 1.0, lab)
    nb.link(nb.math('MULTIPLY', met, 0.55), nb.p.inputs['Metallic'])
    L._CUSTOM[key] = nb.m
    return nb.m


def can_model(name, r=0.2, h=0.25, loc=(0, 0, 0), label='#3D7CC9', fish=True, rot=(0, 0, 0), lid=True,
              fish_psi=45.0):
    """Upright tin can with a fish decal on the camera-facing side (fish_psi: 45 = toward the camera)."""
    objs = [cyl(name + '_body', r, h, (0, 0, 0), mat=can_mat(label), segs=32, bevel=0.015, bsegs=2,
                cap_mat=flat('#D5DCE6', 0.3, 0.6))]
    if lid:
        objs.append(cyl(name + '_rim', r * 0.98, 0.02, (0, 0, h - 0.004), mat=flat('#E3E9F0', 0.25, 0.7), segs=32,
                        bevel=0.008))
        objs.append(cyl(name + '_lid', r * 0.8, 0.012, (0, 0, h + 0.004), mat=flat('#C3CCD8', 0.3, 0.6), segs=32,
                        bevel=0.004))
        ring = L.MB()
        rm = flat('#F2F5F9', 0.25, 0.7)
        pts = [Vector((r * 0.38 + 0.06 * math.cos(t), 0.045 * math.sin(t), h + 0.022)) for t in
               [math.tau * k / 12 for k in range(13)]]
        for a, b in zip(pts, pts[1:]):
            ring.seg(a, b, 0.012 * (r / 0.2), rm, segs=5)
        o = ring.done(name + '_tab')
        o.rotation_euler.z = math.radians(-45 + 180)
        objs.append(o)
    if fish:
        k = r / 0.2
        pts = [(0.075 * k * math.cos(t), 0.04 * k * math.sin(t)) for t in [math.tau * i / 14 for i in range(14)]]
        body = pts[7:] + pts[:7]
        tail = [(-0.07 * k, 0.0), (-0.115 * k, 0.04 * k), (-0.115 * k, -0.04 * k)]
        fm = flat('#F08A5D', 0.5)
        f1 = extrude(name + '_fish', [(x + 0.02 * k, y) for x, y in pts], 0.008, top=fm, side=fm, bevel=0.0)
        f2 = extrude(name + '_ftail', tail[::-1], 0.008, top=fm, side=fm, bevel=0.0)
        eye = sphere(name + '_feye', 0.011 * k, (0.055 * k, 0.01 * k, 0.008), flat('#FFFFFF', 0.4), segs=8, rings=6)
        g = L.group([f1, f2, eye], name + '_decal')
        d = PA.facing_dir(fish_psi)
        g.location = tuple(d * (r + 0.002) + Vector((0, 0, h * 0.5)))
        g.rotation_euler = Euler((math.radians(90), 0, math.radians(fish_psi)), 'XYZ')
        objs.append(g)
    return L.group(objs, name, loc=loc, rot=rot)


def jar_model(name, r=0.1, h=0.2, loc=(0, 0, 0), fill='#E8A23C', lid='#D9483B'):
    """Glossy jar (jam / honey / pickles) with a cloth-capped lid and a white label."""
    objs = [cyl(name + '_body', r, h * 0.84, (0, 0, 0), mat=flat(fill, 0.18), segs=18, bevel=0.025),
            cyl(name + '_label', r * 1.01, h * 0.3, (0, 0, h * 0.24), mat=flat('#F4F1EA', 0.7), segs=18, bevel=0.0),
            cyl(name + '_lid', r * 1.08, h * 0.16, (0, 0, h * 0.82), mat=flat(lid, 0.7), segs=18, bevel=0.015)]
    return L.group(objs, name, loc=loc)


def axe_model(name, s=1.0, loc=(0, 0, 0), rot=(0, 0, 0), head='#B9C2CE', handle='#C98F55'):
    """Chunky axe along local +X: handle from x=-0.42s to +0.32s, blade at +X end facing -Y."""
    wood = tonal(handle, 0.08, 3.0, rough=0.6)
    steel = flat(head, 0.3, 0.7)
    edge = flat('#EEF3F8', 0.2, 0.75)
    objs = [cyl(name + '_h', 0.045 * s, 0.78 * s, (-0.42 * s, 0, 0), rot=(0, 90, 0), mat=wood, segs=12,
                origin='bottom', bevel=0.02 * s)]
    objs.append(sphere(name + '_knob', 0.055 * s, (-0.43 * s, 0, 0), wood, segs=12, rings=8))
    pts = [(0.0, 0.05), (0.0, -0.06), (-0.05, -0.12), (-0.08, -0.22), (0.0, -0.26), (0.12, -0.27), (0.2, -0.24),
           (0.21, -0.18), (0.13, -0.11), (0.11, -0.04), (0.11, 0.05)]
    bl = extrude(name + '_blade', [(x * s, y * s) for x, y in pts], 0.07 * s, top=steel, side=steel, bevel=0.012 * s)
    bl.location = (0.2 * s, 0.0, -0.035 * s)
    objs.append(bl)
    ed = extrude(name + '_edge', [(x * s, y * s) for x, y in [(-0.08, -0.22), (0.0, -0.26), (0.12, -0.27),
                                                              (0.2, -0.24), (0.19, -0.205), (0.11, -0.225),
                                                              (0.0, -0.215), (-0.05, -0.18)]],
                 0.074 * s, top=edge, side=edge, bevel=0.006 * s)
    ed.location = (0.2 * s, 0.0, -0.037 * s)
    objs.append(ed)
    return L.group(objs, name, loc=loc, rot=rot)


def pick_model(name, s=1.0, loc=(0, 0, 0), rot=(0, 0, 0)):
    """Pickaxe along local +X: handle, curved double pick head across the +X end (along Y)."""
    wood = tonal('#C98F55', 0.08, 3.0, rough=0.6)
    iron = flat('#7D8794', 0.32, 0.7)
    objs = [cyl(name + '_h', 0.045 * s, 0.8 * s, (-0.45 * s, 0, 0), rot=(0, 90, 0), mat=wood, segs=12,
                bevel=0.02 * s)]
    mb = L.MB()
    n = 12
    pts = []
    for k in range(n + 1):
        t = -1 + 2 * k / n
        pts.append(Vector((0.3 * s - 0.09 * s * t * t, 0.34 * s * t, 0.0)))
    for k in range(n):
        t = abs(-1 + 2 * (k + 0.5) / n)
        rr = (0.055 - 0.04 * t ** 1.5) * s
        mb.seg(pts[k], pts[k + 1], rr, iron, segs=10, r2=(0.055 - 0.04 * min(1.0, t + 0.16) ** 1.5) * s)
    objs.append(mb.done(name + '_head'))
    objs.append(box(name + '_col', (0.12 * s, 0.11 * s, 0.11 * s), (0.31 * s, 0, -0.055 * s), mat=iron, bevel=0.02 * s))
    return L.group(objs, name, loc=loc, rot=rot)


def sickle_model(name, s=1.0, loc=(0, 0, 0), rot=(0, 0, 0)):
    """Sickle lying flat: short handle along -X, crescent blade hooking around +X/+Y."""
    wood = tonal('#B97A43', 0.08, 3.0, rough=0.6)
    steel = flat('#DCE4EE', 0.22, 0.75)
    objs = [cyl(name + '_h', 0.05 * s, 0.34 * s, (-0.36 * s, 0, 0), rot=(0, 90, 0), mat=wood, segs=12, bevel=0.02 * s),
            cyl(name + '_fer', 0.055 * s, 0.06 * s, (-0.03 * s, 0, 0), rot=(0, 90, 0), mat=flat('#7D8794', 0.35, 0.6),
                segs=12, bevel=0.01 * s)]
    mb = L.MB()
    R = 0.2 * s
    c = Vector((0.03 * s + R, 0.0, 0.0)) + Vector((0, R * 0.15, 0))
    n = 16
    prev = None
    for k in range(n + 1):
        a = math.radians(180 - 250 * k / n)
        p = c + Vector((R * math.cos(a), R * math.sin(a), 0.0))
        if prev is not None:
            t = k / n
            mb.seg(prev, p, (0.045 - 0.035 * t) * s * 1.0, steel, segs=8, r2=(0.045 - 0.035 * min(1.0, t + 1.0 / n)) * s)
        prev = p
    blade = mb.done(name + '_blade')
    blade.scale = (1.0, 1.0, 0.45)
    objs.append(blade)
    return L.group(objs, name, loc=loc, rot=rot)


# =========================================================================== BUILDINGS


SHOP_NOTE = ('General store (3x3 m): cream plank shop with a false front, green-white awning, open counter with a '
             'brass cash register, shelves of cans / jars / tools inside. Front faces screen down-left (world -Y). '
             'staffPoints[0] = the clerk spot BEHIND the counter (facing SW = SE flipped): draw the shop (depth d), '
             'then the clerk (d + 0.5), then the overlay sprite shop_general_front (d + 1, same anchor) so the '
             'counter hides the clerk\'s legs. customerPoint = where the first customer stands in front of the '
             'counter (queue toward screen down-left); cashPoint = coin pad; inPoint = restock pad (porters).')


@bld('shop_general', 'building', 'bld_buildings', fp=(3.0, 3.0), front='-Y', catcher=20.0, notes=SHOP_NOTE)
def b_shop_general():
    rnd = L.rng(31)
    W, Y0, Y1 = 2.5, -0.55, 1.2           # inner shop box: x in [-W/2, W/2], y in [Y0, Y1]
    H = 2.5                                # wall / opening height
    D = Y1 - Y0
    yc = (Y0 + Y1) / 2
    cream = ('#EFE3C8', '#E2D2B0')
    trim = flat('#7A4A2A', 0.8)
    # stone footing + plank floor
    box('footing', (W + 0.2, D + 0.2, 0.12), (0, yc, 0), mat=snowy('#8E96A3', lo=0.75, hi=0.9), bevel=0.04)
    box('floor', (W - 0.1, D - 0.05, 0.03), (0, yc, 0.12), mat=L.stripes('#C98F55', '#B27843', 3.3, 'X', soft=0.03),
        bevel=0.0)
    # walls: back + two sides (painted planks), corner posts
    plank_wall('wback', (W, 0.14, H), (0, Y1 - 0.07, 0.12), cream)
    for s in (-1, 1):
        plank_wall('wside', (0.14, D, H), (s * (W / 2 - 0.07), yc, 0.12), cream, count=11)
        for y in (Y0, Y1):
            box('post', (0.18, 0.18, H + 0.2), (s * W / 2, y, 0.0), mat=trim, bevel=0.035)
    # false front above the opening (signboard silhouette), with cornice + gold emblem
    ff_h = 1.25
    prof = [(-W / 2 - 0.08, 0.0), (W / 2 + 0.08, 0.0), (W / 2 + 0.08, ff_h * 0.62), (W * 0.3, ff_h * 0.62),
            (W * 0.3, ff_h * 0.82), (W * 0.16, ff_h * 0.82)]
    for k in range(9):
        a = math.pi * k / 8
        prof.append((W * 0.16 * math.cos(a), ff_h * 0.82 + ff_h * 0.18 * math.sin(a)))
    prof += [(-W * 0.16, ff_h * 0.82), (-W * 0.3, ff_h * 0.82), (-W * 0.3, ff_h * 0.62), (-W / 2 - 0.08, ff_h * 0.62)]
    # dedupe consecutive
    pr2 = []
    for p in prof:
        if not pr2 or (abs(p[0] - pr2[-1][0]) + abs(p[1] - pr2[-1][1])) > 1e-4:
            pr2.append(p)
    ffm = L.stripes(cream[0], cream[1], 4.5, 'Y', rough=0.82, soft=0.04)
    ff = extrude('falsefront', pr2[:-1] if pr2[0] == pr2[-1] else pr2, 0.16, rot=PA.facing_rot(0), top=ffm, side=ffm,
                 bevel=0.03)
    ff.location = (0, Y0 + 0.02, H + 0.12)
    # cornice boards + snow on the ledges
    box('cornice', (W + 0.36, 0.3, 0.12), (0, Y0 + 0.02, H + 0.12 + ff_h * 0.62 - 0.02), mat=trim, bevel=0.03)
    L.snow_slab('csnow1', W + 0.3, 0.26, 0.08, (0, Y0 + 0.02, H + 0.12 + ff_h * 0.62 + 0.09), seed=3, droop=0.02)
    box('cornice2', (W * 0.62 + 0.14, 0.26, 0.1), (0, Y0 + 0.02, H + 0.12 + ff_h * 0.82 - 0.02), mat=trim, bevel=0.03)
    L.snow_slab('csnow2', W * 0.6, 0.22, 0.07, (0, Y0 + 0.02, H + 0.12 + ff_h * 0.82 + 0.07), seed=4)
    box('fascia', (W + 0.2, 0.2, 0.16), (0, Y0 - 0.02, H + 0.04), mat=trim, bevel=0.03)
    # round sign plaque on the false front: green disc + gold can & pick emblem
    pl = cyl('plaque', 0.4, 0.06, (0, 0, 0), rot=(90, 0, 0), mat=flat('#3E8E57', 0.6), segs=40, origin='center',
             bevel=0.02, cap_mat=flat('#4FAE65', 0.55))
    rim = cyl('plaque_rim', 0.44, 0.04, (0, 0, 0), rot=(90, 0, 0), mat=flat('#F2C14E', 0.35, 0.6), segs=40,
              origin='center', bevel=0.015)
    pl.location = rim.location = (0, Y0 - 0.1, H + 0.12 + ff_h * 0.55)
    rim.location.y += 0.02
    ez = H + 0.12 + ff_h * 0.55
    box('emb_ledge', (0.5, 0.2, 0.04), (-0.12, Y0 - 0.2, ez - 0.2), mat=trim, bevel=0.01)
    can_model('emblem_can', r=0.12, h=0.2, loc=(-0.14, Y0 - 0.2, ez - 0.16), label='#F2C14E', fish=True)
    axe_model('emblem_axe', s=0.4, loc=(0.16, Y0 - 0.16, ez + 0.02), rot=(90, -55, 0))
    # roof behind the false front (gable along X, snowy)
    roofm = L.stripes('#3E7F55', '#346B47', 4.0, 'Y', rough=0.85, soft=0.04)
    rz = H + 0.12
    g = gable_roof('roof', W + 0.45, D, rz + 0.02, rz + 0.95, 0.3, roofm, snow_frac=(0.6, 0.62), seed=5,
                   ridge_col='#2E5E40')
    for o in top_level(g):
        o.location.y += yc
    for s in (-1, 1):
        gable_end('gable', D + 0.02, rz - 0.01, rz + 0.95, s * (W / 2 - 0.05), L.stripes(cream[0], cream[1], 4.0, 'Z',
                                                                                         soft=0.04)).location.y += yc
    # side window on the visible +X wall
    window('swin', (W / 2 + 0.01, 0.45, 1.75), 'x+', w=0.62, h=0.6, shutters='#3E8E57', seed=7)
    # awning: green + cream stripes, high enough not to hide the clerk's face
    PA.awning(W + 0.4, 0.6, H + 0.32, H + 0.02, Y0 + 0.05, Y0 - 0.62, '#3E9A5A', 'cream', 8, name='awning')
    # ---- shelves on the back wall + left wall, packed with goods
    shelf = flat('#9A6436', 0.8)
    for k, z in enumerate((0.62, 1.18, 1.74)):
        box('shelf', (W - 0.3, 0.34, 0.05), (0, Y1 - 0.31, z), mat=shelf, bevel=0.015)
        x = -W / 2 + 0.28
        j = 0
        while x < W / 2 - 0.25:
            kind = (k + j) % 4
            if kind == 0:
                for q in range(2):
                    can_model('scan', r=0.075, h=0.1, loc=(x + q * 0.16, Y1 - 0.3, z + 0.05),
                              label=['#3D7CC9', '#D9483B', '#3E9A5A'][(j + q) % 3], fish=False)
                x += 0.36
            elif kind == 1:
                jar_model('jar', r=0.07, h=0.17, loc=(x, Y1 - 0.3, z + 0.05),
                          fill=['#E8A23C', '#C8463D', '#7DB34A'][j % 3], lid=['#D9483B', '#3D7CC9', '#F2C14E'][j % 3])
                jar_model('jar', r=0.06, h=0.14, loc=(x + 0.15, Y1 - 0.28, z + 0.05), fill='#F2C14E', lid='#3E9A5A')
                x += 0.34
            elif kind == 2:
                blob('sack', 0.13, (x + 0.05, Y1 - 0.3, z + 0.17), flat('#D8C39A', 0.9), scale=(1.0, 0.8, 0.95),
                     seed=200 + j + k, amp=0.15, subdiv=2, flat_bottom=0.6)
                x += 0.3
            else:
                box('bottle', (0.09, 0.09, 0.22), (x, Y1 - 0.3, z + 0.05), mat=flat('#4F86C2', 0.25), bevel=0.03)
                box('bottle', (0.09, 0.09, 0.18), (x + 0.13, Y1 - 0.3, z + 0.05), mat=flat('#7DB34A', 0.25),
                    bevel=0.03)
                x += 0.3
            j += 1
    # tools hanging on the back wall above the top shelf
    axe_model('wall_axe', s=0.5, loc=(-0.55, Y1 - 0.2, 2.2), rot=(90, 0, 0))
    pick_model('wall_pick', s=0.45, loc=(0.25, Y1 - 0.2, 2.18), rot=(90, 0, 0))
    sickle_model('wall_sickle', s=0.55, loc=(0.85, Y1 - 0.2, 2.15), rot=(90, 0, 0))
    # ---- counter at the front opening (overlay part): plank front + light top + cash register
    cy_ = Y0 - 0.22
    box('counter', (1.9, 0.5, 0.92), (-0.1, cy_, 0.0), mat=L.stripes('#C98F55', '#B27843', 10.0 / 1.9, 'X', soft=0.03),
        bevel=0.03)
    box('ctop', (2.05, 0.62, 0.08), (-0.1, cy_, 0.92), mat=tonal('#E0AE72', 0.08, 2.0), bevel=0.03)
    box('ckick', (1.95, 0.08, 0.14), (-0.1, cy_ - 0.24, 0.0), mat=trim, bevel=0.02)
    # cash register (brass + red keys) on the right of the counter
    rx = 0.52
    brass = flat('#D9A93C', 0.3, 0.75)
    box('reg_base', (0.46, 0.36, 0.14), (rx, cy_ + 0.02, 1.0), mat=brass, bevel=0.035)
    box('reg_body', (0.42, 0.26, 0.2), (rx, cy_ + 0.07, 1.12), mat=brass, bevel=0.05, taper=(0.9, 0.7))
    box('reg_disp', (0.3, 0.08, 0.13), (rx, cy_ + 0.14, 1.3), mat=flat('#2B2F3A', 0.4), bevel=0.02)
    for i in range(3):
        for j in range(2):
            sphere('reg_key', 0.026, (rx - 0.1 + i * 0.1, cy_ - 0.09 + j * 0.06, 1.17 + j * 0.04),
                   flat(['#D9483B', '#F4F1EA', '#3D7CC9'][i], 0.4), scale=(1, 1, 0.6), segs=10, rings=6)
    cyl('reg_crank', 0.035, 0.12, (rx + 0.25, cy_ + 0.05, 1.14), rot=(0, 90, 0), mat=brass, segs=10, origin='center')
    # goods on the counter: a jar + a can pyramid
    jar_model('cjar', r=0.08, h=0.2, loc=(-0.8, cy_ + 0.02, 1.0), fill='#E8A23C', lid='#D9483B')
    for i, (x, z) in enumerate([(-0.45, 0), (-0.27, 0), (-0.36, 0.13)]):
        can_model('ccan', r=0.08, h=0.12, loc=(x, cy_ - 0.04, 1.0 + z), label=['#D9483B', '#3D7CC9', '#F2C14E'][i],
                  fish=False)
    # ---- outdoor display on the visible right side: barrel of tools + crate of cans + snow drift
    PA.barrel_model('tbarrel', loc=(1.55, -0.95, 0), scale=0.62, snow=False, seed=3)
    axe_model('baxe', s=0.5, loc=(1.52, -0.98, 0.62), rot=(0, -80, 20))
    pick_model('bpick', s=0.45, loc=(1.6, -0.9, 0.6), rot=(0, -72, -35))
    PA.crate_model('ccrate', 0.5, (1.55, -0.2, 0), seed=4, snow=False)
    for i, (x, y) in enumerate([(1.45, -0.3), (1.65, -0.1), (1.48, -0.08), (1.62, -0.31)]):
        can_model('crcan', r=0.075, h=0.1, loc=(x, y, 0.5), label=['#3D7CC9', '#D9483B'][i % 2], fish=False)
    PA.lantern('lan', (-W / 2 - 0.12, Y0 - 0.25, 1.6), 0.14, 3.0)
    cyl('lanpost', 0.04, 0.5, (-W / 2 - 0.12, Y0 - 0.25, 1.84), mat=trim, segs=8)
    LA.snow_drift('d1', 0.3, (-1.45, 1.2, 0.0), seed=3)
    LA.snow_drift('d2', 0.22, (1.35, 1.3, 0.0), seed=4)
    # ---- markers
    clerk = (-0.1, Y0 + 0.22, 0.0)
    mark('staff', clerk, facing=(0, -1, 0))
    mark('customer', (-0.1, Y0 - 1.0, 0.0), facing=(0, 1, 0))
    mark('cash', (1.1, Y0 - 1.25, 0.0))
    mark('in', (2.55, 0.35, 0.0))
    return {'overlay': {'key': 'shop_general_front', 'at': clerk},
            'fx': {'register': (rx, cy_, 1.45), 'coins': (1.1, Y0 - 1.25, 0.1)}}


TOWER_NOTE = ('Watchtower (2x2 m footprint, ~5 m): four log legs with cross braces, a ladder on the front (-Y, screen '
              'down-left), a railed platform at 3.4 m and an iron fire basket on top. Idle = cold logs in the '
              'basket; anims.work = the beacon fire burning (4-frame loop, flames + glow + embers + smoke). '
              'fxPoints.fire = basket top (for fx_fire_big), fxPoints.smoke = above the flames.')


@bld('watchtower', 'building', 'bld_buildings', fp=(2.0, 2.0), front='-Y', catcher=24.0, work=4, fps=8,
     notes=TOWER_NOTE)
def b_watchtower():
    rnd = L.rng(41)
    bark = ['#8A5A33', '#7C4D2C', '#946036']
    endm = L.end_grain()
    PZ = 3.35                     # platform top
    b0, b1 = 0.82, 0.62           # leg half-spread at the ground / at the platform
    mb_legs = []
    for i, (sx, sy) in enumerate(((-1, -1), (1, -1), (1, 1), (-1, 1))):
        p = Vector((sx * b0, sy * b0, -0.05))
        q = Vector((sx * b1, sy * b1, PZ + 0.95))
        mb = L.MB()
        mb.seg(p, q, 0.12, tonal(bark[i % 3], 0.14, 5.0), segs=16, r2=0.105)
        o = mb.done('leg%d' % i)
        mb_legs.append((p, q))
        cyl('legcap', 0.105, 0.03, tuple(q), mat=endm, segs=16, bevel=0.0)
        PA.snow_cap('legsnow', 0.1, tuple(q + Vector((0, 0, 0.02))), 0.06, i)

    def leg_at(i, z):
        p, q = mb_legs[i]
        t = (z - p.z) / (q.z - p.z)
        return p + (q - p) * t

    # cross braces (X) on all four faces + a ring of horizontal beams
    beam = tonal('#9A6638', 0.12, 4.0)
    faces = [(0, 1), (1, 2), (2, 3), (3, 0)]
    for fi, (a, b) in enumerate(faces):
        mb = L.MB()
        z0, z1 = 0.35, PZ - 0.25
        pa0, pb0, pa1, pb1 = leg_at(a, z0), leg_at(b, z0), leg_at(a, z1), leg_at(b, z1)
        out = (pa0 + pb0).normalized() * 0.08
        out.z = 0
        mb.seg(pa0 + out, pb1 + out, 0.06, beam, segs=10)
        mb.seg(pb0 + out * 1.6, pa1 + out * 1.6, 0.06, beam, segs=10)
        zm = 1.7
        mb.seg(leg_at(a, zm) + out, leg_at(b, zm) + out, 0.065, beam, segs=10)
        mb.done('brace%d' % fi)
    # platform: joists + plank deck + railing
    deck = L.stripes('#C98F55', '#B27843', 3.3, 'X', rough=0.8, soft=0.03)
    box('joist', (1.75, 1.75, 0.16), (0, 0, PZ - 0.2), mat=flat('#7C4D2C', 0.8), bevel=0.03)
    box('deck', (1.95, 1.95, 0.1), (0, 0, PZ - 0.06), mat=deck, bevel=0.03)
    rail = tonal('#A86A36', 0.1, 4.0)
    R = 0.93
    for (sx, sy) in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
        cyl('rpost', 0.06, 0.8, (sx * R, sy * R, PZ + 0.02), mat=rail, segs=10, cap_mat=endm)
        PA.snow_cap('rpsnow', 0.06, (sx * R, sy * R, PZ + 0.83), 0.045, int(sx * 3 + sy))
    for z in (PZ + 0.38, PZ + 0.74):
        for s in (-1, 1):
            log('railx', 0.045, 2 * R + 0.12, (0, s * R, z), rot=(0, 90, 0), bark=rail, end=endm, segs=10)
            log('raily', 0.045, 2 * R + 0.12, (s * R, 0, z), rot=(90, 0, 0), bark=rail, end=endm, segs=10)
    L.snow_slab('rsnowx', 2 * R, 0.1, 0.05, (0, -R, PZ + 0.78), seed=2)
    L.snow_slab('rsnowy', 0.1, 2 * R, 0.05, (R, 0, PZ + 0.78), seed=3)
    # snow lumps on the deck corners
    for i, (x, y) in enumerate(((-0.7, 0.7), (0.72, 0.66), (-0.66, -0.62))):
        PA.snow_cap('dsnow', 0.22, (x, y, PZ + 0.04), 0.09, 10 + i, scale=(1.3, 1.0, 1.0))
    # ladder on the front (-Y) face, leaning a little
    lad = flat('#C98F55', 0.75)
    ly0, ly1 = -b0 - 0.42, -b1 - 0.08
    mb = L.MB()
    for s in (-1, 1):
        mb.seg(Vector((s * 0.24, ly0, 0.0)), Vector((s * 0.24, ly1, PZ + 0.5)), 0.04, lad, segs=8)
    n = 9
    for k in range(1, n + 1):
        t = k / (n + 0.6)
        y = ly0 + (ly1 - ly0) * t
        z = (PZ + 0.5) * t
        mb.seg(Vector((-0.24, y, z)), Vector((0.24, y, z)), 0.03, lad, segs=6)
    mb.done('ladder')
    # fire basket on a short iron pedestal in the middle of the platform
    iron = flat('#3D424C', 0.45, 0.6)
    BZ = PZ + 0.62
    cyl('ped', 0.09, 0.62, (0, 0, PZ + 0.02), mat=iron, segs=14, r_top=0.07)
    cyl('pedfoot', 0.26, 0.06, (0, 0, PZ + 0.02), mat=iron, segs=20, r_top=0.2)
    mb = L.MB()
    n = 12
    for k in range(n):
        a = math.tau * k / n
        p = Vector((0.18 * math.cos(a), 0.18 * math.sin(a), BZ))
        q = Vector((0.4 * math.cos(a), 0.4 * math.sin(a), BZ + 0.42))
        mb.seg(p, q, 0.025, iron, segs=6)
    mb.done('cage')
    cyl('bowl', 0.2, 0.08, (0, 0, BZ - 0.02), mat=iron, segs=20, r_top=0.24)
    for z, r in ((BZ + 0.2, 0.3), (BZ + 0.42, 0.41)):
        ring = L.MB()
        pts = [Vector((r * math.cos(t), r * math.sin(t), z)) for t in [math.tau * k / 24 for k in range(25)]]
        for a_, b_ in zip(pts, pts[1:]):
            ring.seg(a_, b_, 0.028, iron, segs=6)
        ring.done('hoop')
    # logs in the basket (crossed)
    for i in range(5):
        a = math.radians(i * 37 + 10)
        log('blog', 0.06, 0.55, (0.04 * math.cos(a * 3), 0.04 * math.sin(a * 3), BZ + 0.12 + 0.05 * i),
            rot=(0, 90, math.degrees(a)), bark=tonal('#6E4428', 0.15, 6.0), segs=10)
    ember = L.emissive('tember', '#4A2A20', 'fire', 0.0)
    for i in range(14):
        a = rnd.uniform(0, math.tau)
        rr = rnd.uniform(0, 0.2)
        blob('coal', rnd.uniform(0.05, 0.08), (rr * math.cos(a), rr * math.sin(a), BZ + 0.1), ember, seed=60 + i,
             amp=0.3, subdiv=1, facet=True)
    cold_snow = PA.snow_cap('coldsnow', 0.24, (0, 0, BZ + 0.36), 0.07, 5)
    # a small pennant on the back corner post
    cyl('fpole', 0.03, 1.25, (-R, R, PZ + 0.8), mat=flat('wood_dark', 0.8), segs=8)
    PA.flag('pennant', (-R + 0.02, R, PZ + 2.0), 0.55, 0.32, 'red', seed=3, emblem=True)
    # ---- work loop: beacon fire
    flames = L.Flames('bflame', [((0.0, 0.0, BZ + 0.22), 0.2, 0.75), ((0.13, 0.1, BZ + 0.2), 0.15, 0.55),
                                 ((-0.14, 0.06, BZ + 0.2), 0.14, 0.5), ((0.04, -0.14, BZ + 0.2), 0.15, 0.6),
                                 ((-0.06, 0.15, BZ + 0.2), 0.13, 0.45)], lean=0.14)
    glow = L.point_light('bglow', (0.3, -0.3, BZ + 0.5), 'fire', 0.0, 0.3)
    glow2 = L.point_light('bglow2', (0.0, 0.0, PZ + 0.35), 'fire', 0.0, 0.4)
    sparks = L.Spray('spark', (0.0, 0.0, BZ + 0.5), (0.1, 0.05, 1.5), L.emissive('sparkm', '#FFD45A', '#FFC24A', 3.0),
                     n=9, grav=0.4, r=0.035, spread=0.45, seed=4)
    smoke = L.Smoke('bsmoke', (0.05, 0.0, BZ + 1.0), n=3, rise=1.0, drift=(0.3, 0.12), r0=0.16, r1=0.38,
                    color='#B7BDC6', alpha=0.85, seed=7, fade_in=0.2)

    def idle():
        flames.show(False)
        sparks.show(False)
        smoke.show(False)
        L.set_emission(ember, 0.0)
        glow.data.energy = 0.0
        glow2.data.energy = 0.0
        show([cold_snow], True)

    def work(i):
        flames.set(i)
        sparks.set(i)
        smoke.set(i)
        show([cold_snow], False)
        s = [1.0, 1.25, 0.85, 1.15][i]
        L.set_emission(ember, 3.0 * s)
        glow.data.energy = 90 * s
        glow2.data.energy = 40 * s

    idle()
    return {'idle': idle, 'work': work, 'fx': {'fire': (0.0, 0.0, BZ + 0.45), 'smoke': (0.05, 0.0, BZ + 1.6),
                                                'platform': (0.0, 0.0, PZ)}}
