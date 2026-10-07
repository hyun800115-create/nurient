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


def bld(key, kind, atlas, fp=None, yaw=0.0, shadow=True, samples=48, notes='', front=None, catcher=16.0,
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
           cross=True, seed=9, round_=False):
    """Glowing window on a wall face 'y-' (front), 'x+' (right side), 'y+', 'x-'; loc = top-centre on the wall
    surface (z = top of the glass).  round_=True -> round porthole window."""
    fm = flat(frame, 0.8)
    wm = L.emissive(name + '_glass', '#FFE2A0', 'window', glow)
    objs = []
    if round_:
        r = w / 2
        objs.append(cyl(name + '_fr', r + 0.08, 0.1, (0, -0.02, -r), rot=(90, 0, 0), mat=fm, segs=28, origin='center',
                        bevel=0.03))
        objs.append(cyl(name + '_gl', r, 0.1, (0, -0.05, -r), rot=(90, 0, 0), mat=wm, segs=28, origin='center',
                        bevel=0.01))
        if cross:
            objs.append(box(name + '_b1', (0.04, 0.11, 2 * r), (0, -0.07, -2 * r), mat=fm, bevel=0.0))
            objs.append(box(name + '_b2', (2 * r, 0.11, 0.04), (0, -0.07, -r - 0.02), mat=fm, bevel=0.0))
        if sill_snow:
            objs.append(L.snow_slab(name + '_sill', 2 * r, 0.14, 0.04, (0, -0.08, -2 * r - 0.1), seed=seed))
    else:
        objs.append(box(name + '_fr', (w + 0.16, 0.1, h + 0.16), (0, -0.02, -h - 0.08), mat=fm, bevel=0.03))
        objs.append(box(name + '_gl', (w, 0.1, h), (0, -0.05, -h), mat=wm, bevel=0.01))
        if cross:
            objs.append(box(name + '_b1', (0.05, 0.11, h), (0, -0.07, -h), mat=fm, bevel=0.0))
            objs.append(box(name + '_b2', (w, 0.11, 0.05), (0, -0.07, -h / 2 - 0.025), mat=fm, bevel=0.0))
        if sill_snow:
            objs.append(L.snow_slab(name + '_sill', w + 0.2, 0.18, 0.05, (0, -0.08, -h - 0.14), seed=seed))
        if shutters:
            for sx in (-1, 1):
                objs.append(box(name + '_sh', (w * 0.42, 0.06, h + 0.08), (sx * (w / 2 + w * 0.24), -0.03, -h - 0.04),
                                mat=flat(shutters, 0.7), bevel=0.02))
    rz = {'y-': 0.0, 'x+': 90.0, 'y+': 180.0, 'x-': -90.0}[face]
    return L.group(objs, name, loc=loc, rot=(0, 0, rz))


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


def axe_model(name, s=1.0, loc=(0, 0, 0), rot=(0, 0, 0), head='#B9C2CE', handle='#C98F55', metal=0.7):
    """Chunky axe along local +X: handle from x=-0.42s to +0.32s, blade at +X end facing -Y."""
    wood = tonal(handle, 0.08, 3.0, rough=0.6)
    steel = flat(head, 0.3 if metal > 0.5 else 0.4, metal)
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


def sickle_model(name, s=1.0, loc=(0, 0, 0), rot=(0, 0, 0), flat_blade=False):
    """Sickle lying flat: short handle along -X, crescent blade hooking around +X/+Y.  flat_blade=True builds the
    blade as one smooth extruded crescent with a bright edge (the item icon); False = the segmented blade used in
    the building props (shop wall, smithy rack)."""
    wood = tonal('#B97A43', 0.08, 3.0, rough=0.6)
    steel = flat('#DCE4EE', 0.22, 0.75)
    objs = [cyl(name + '_h', 0.05 * s, 0.34 * s, (-0.36 * s, 0, 0), rot=(0, 90, 0), mat=wood, segs=12, bevel=0.02 * s),
            cyl(name + '_fer', 0.055 * s, 0.06 * s, (-0.03 * s, 0, 0), rot=(0, 90, 0), mat=flat('#7D8794', 0.35, 0.6),
                segs=12, bevel=0.01 * s)]
    R = 0.2 * s
    c = Vector((0.03 * s + R, 0.0, 0.0)) + Vector((0, R * 0.15, 0))
    if flat_blade:
        n = 24
        outer, inner = [], []
        for k in range(n + 1):
            t = k / n
            a = math.radians(180 - 250 * t)
            w = (0.085 - 0.07 * t) * s
            outer.append((c.x + (R + w * 0.5) * math.cos(a), c.y + (R + w * 0.5) * math.sin(a)))
            inner.append((c.x + (R - w * 0.5) * math.cos(a), c.y + (R - w * 0.5) * math.sin(a)))
        pts = outer + inner[::-1]
        face = flat('#9AA6B6', 0.38, 0.35)
        blade = extrude(name + '_blade', pts[::-1], 0.035 * s, top=face, side=flat('#E3EAF2', 0.3, 0.5), bottom=face,
                        bevel=0.008 * s)
        blade.location.z = -0.0175 * s
        objs.append(blade)
        return L.group(objs, name, loc=loc, rot=rot)
    mb = L.MB()
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
    # round sign plaque on the false front: green disc with a gold rim + a 3D can & pickaxe emblem
    ez = H + 0.12 + ff_h * 0.5
    pl = cyl('plaque', 0.42, 0.06, (0, Y0 - 0.17, ez), rot=(90, 0, 0), mat=flat('#3E8E57', 0.6), segs=40,
             origin='center', bevel=0.02, cap_mat=flat('#4FAE65', 0.55))
    cyl('plaque_rim', 0.47, 0.05, (0, Y0 - 0.15, ez), rot=(90, 0, 0), mat=flat('#F2C14E', 0.35, 0.6), segs=40,
        origin='center', bevel=0.015)
    del pl
    pick_model('emblem_pick', s=0.5, loc=(0.0, Y0 - 0.24, ez + 0.02), rot=(90, -48, 0))
    box('emb_ledge', (0.42, 0.22, 0.04), (0.0, Y0 - 0.3, ez - 0.27), mat=trim, bevel=0.01)
    can_model('emblem_can', r=0.15, h=0.26, loc=(0.0, Y0 - 0.32, ez - 0.23), label='#D9483B', fish=True)
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
    box('counter', (1.9, 0.5, 0.72), (0.0, cy_, 0.0), mat=L.stripes('#C98F55', '#B27843', 10.0 / 1.9, 'X', soft=0.03),
        bevel=0.03)
    box('ctop', (2.05, 0.62, 0.08), (0.0, cy_, 0.72), mat=tonal('#E0AE72', 0.08, 2.0), bevel=0.03)
    box('ckick', (1.95, 0.08, 0.14), (0.0, cy_ - 0.24, 0.0), mat=trim, bevel=0.02)
    # cash register (brass + red keys) on the right of the counter
    rx = -0.5
    brass = flat('#D9A93C', 0.3, 0.75)
    box('reg_base', (0.46, 0.36, 0.14), (rx, cy_ + 0.02, 0.8), mat=brass, bevel=0.035)
    box('reg_body', (0.42, 0.26, 0.2), (rx, cy_ + 0.07, 0.92), mat=brass, bevel=0.05, taper=(0.9, 0.7))
    box('reg_disp', (0.3, 0.08, 0.13), (rx, cy_ + 0.14, 1.1), mat=flat('#2B2F3A', 0.4), bevel=0.02)
    for i in range(3):
        for j in range(2):
            sphere('reg_key', 0.026, (rx - 0.1 + i * 0.1, cy_ - 0.09 + j * 0.06, 0.97 + j * 0.04),
                   flat(['#D9483B', '#F4F1EA', '#3D7CC9'][i], 0.4), scale=(1, 1, 0.6), segs=10, rings=6)
    cyl('reg_crank', 0.035, 0.12, (rx - 0.25, cy_ + 0.05, 0.94), rot=(0, 90, 0), mat=brass, segs=10, origin='center')
    # goods on the counter: a jar + a can pyramid
    jar_model('cjar', r=0.08, h=0.2, loc=(-0.88, cy_ + 0.04, 0.8), fill='#E8A23C', lid='#D9483B')
    for i, x in enumerate((0.72, 0.9)):
        can_model('ccan', r=0.075, h=0.1, loc=(x, cy_ - 0.06, 0.8), label=['#D9483B', '#3D7CC9'][i], fish=False)
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
    L.point_light('shoplamp', (0.0, Y1 - 0.8, H - 0.2), 'window', 30.0, 0.3)
    clerk = (0.05, Y0 + 0.3, 0.0)
    mark('staff', clerk, facing=(0, -1, 0))
    mark('customer', (0.05, Y0 - 1.05, 0.0), facing=(0, 1, 0))
    mark('cash', (1.1, Y0 - 1.25, 0.0))
    mark('in', (2.55, 0.35, 0.0))
    return {'overlay': {'key': 'shop_general_front', 'at': clerk},
            'fx': {'register': (rx, cy_, 1.25), 'coins': (1.1, Y0 - 1.25, 0.1)}}


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
        p = Vector((0.22 * math.cos(a), 0.22 * math.sin(a), BZ))
        q = Vector((0.5 * math.cos(a), 0.5 * math.sin(a), BZ + 0.48))
        mb.seg(p, q, 0.025, iron, segs=6)
    mb.done('cage')
    cyl('bowl', 0.24, 0.09, (0, 0, BZ - 0.02), mat=iron, segs=20, r_top=0.29)
    for z, r in ((BZ + 0.22, 0.36), (BZ + 0.48, 0.51)):
        ring = L.MB()
        pts = [Vector((r * math.cos(t), r * math.sin(t), z)) for t in [math.tau * k / 24 for k in range(25)]]
        for a_, b_ in zip(pts, pts[1:]):
            ring.seg(a_, b_, 0.028, iron, segs=6)
        ring.done('hoop')
    # logs in the basket (crossed)
    for i in range(5):
        a = math.radians(i * 37 + 10)
        log('blog', 0.07, 0.7, (0.04 * math.cos(a * 3), 0.04 * math.sin(a * 3), BZ + 0.14 + 0.06 * i),
            rot=(0, 90, math.degrees(a)), bark=tonal('#6E4428', 0.15, 6.0), segs=10)
    ember = L.emissive('tember', '#4A2A20', 'fire', 0.0)
    for i in range(14):
        a = rnd.uniform(0, math.tau)
        rr = rnd.uniform(0, 0.2)
        blob('coal', rnd.uniform(0.05, 0.08), (rr * math.cos(a), rr * math.sin(a), BZ + 0.1), ember, seed=60 + i,
             amp=0.3, subdiv=1, facet=True)
    cold_snow = PA.snow_cap('coldsnow', 0.3, (0, 0, BZ + 0.44), 0.08, 5)
    # a small pennant on the back corner post
    cyl('fpole', 0.03, 1.25, (-R, R, PZ + 0.8), mat=flat('wood_dark', 0.8), segs=8)
    PA.flag('pennant', (-R + 0.02, R, PZ + 2.0), 0.55, 0.32, 'red', seed=3, emblem=True)
    # ---- work loop: beacon fire
    flames = L.Flames('bflame', [((0.0, 0.0, BZ + 0.3), 0.3, 1.25), ((0.2, 0.12, BZ + 0.28), 0.21, 0.9),
                                 ((-0.2, 0.08, BZ + 0.28), 0.2, 0.85), ((0.06, -0.2, BZ + 0.28), 0.21, 0.95),
                                 ((-0.08, 0.22, BZ + 0.28), 0.18, 0.75), ((0.22, -0.12, BZ + 0.3), 0.15, 0.6),
                                 ((-0.22, -0.14, BZ + 0.3), 0.15, 0.65)], lean=0.12)
    glow = L.point_light('bglow', (0.35, -0.35, BZ + 0.7), 'fire', 0.0, 0.3)
    glow2 = L.point_light('bglow2', (0.0, 0.0, PZ + 0.4), 'fire', 0.0, 0.4)
    sparks = L.Spray('spark', (0.0, 0.0, BZ + 0.8), (0.12, 0.05, 1.9), L.emissive('sparkm', '#FFD45A', '#FFC24A', 4.0),
                     n=10, grav=0.5, r=0.05, spread=0.55, seed=4)
    smoke = L.Smoke('bsmoke', (0.08, 0.0, BZ + 1.75), n=3, rise=1.1, drift=(0.32, 0.14), r0=0.18, r1=0.42,
                    color='#AEB5C0', alpha=0.8, seed=7, fade_in=0.25)

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
        glow.data.energy = 140 * s
        glow2.data.energy = 60 * s

    idle()
    return {'idle': idle, 'work': work, 'fx': {'fire': (0.0, 0.0, BZ + 0.5), 'smoke': (0.08, 0.0, BZ + 2.1),
                                                'platform': (0.0, 0.0, PZ)}}


def log_walls_cut(W, D, wall_h, r=0.14, seed=1, cols=('#B5763F', '#A86A36', '#C08049'), over=0.2, cuts=None,
                  inner_col='#5E3A22'):
    """Interlocking log walls with door openings.  cuts = {face: (a0, a1, z_top)} with face in
    'x+', 'x-' (span along y) or 'y-', 'y+' (span along x).  Returns (top z, list of objects)."""
    rnd = L.rng(seed)
    endm = L.end_grain()
    hc = r * 1.84
    n = int(round(wall_h / hc))
    cuts = cuts or {}
    objs = []

    def segs(full0, full1, face, zc):
        c = cuts.get(face)
        if not c or zc - r > c[2]:
            return [(full0, full1)]
        out = []
        if c[0] - 0.02 > full0:
            out.append((full0, c[0] - 0.02))
        if c[1] + 0.02 < full1:
            out.append((c[1] + 0.02, full1))
        return out

    for k in range(n):
        z = r + k * hc
        for sgn in (-1, 1):
            face = 'y+' if sgn > 0 else 'y-'
            c = cols[(k + (sgn > 0)) % len(cols)]
            for a0, a1 in segs(-W / 2 - over, W / 2 + over, face, z):
                objs.append(log('lx', r, a1 - a0, ((a0 + a1) / 2 + rnd.uniform(-0.02, 0.02), sgn * D / 2, z),
                                rot=(0, 90, 0), bark=tonal(c, 0.1, 3.0), end=endm, segs=14))
            face = 'x+' if sgn > 0 else 'x-'
            c = cols[(k + 1 + (sgn > 0)) % len(cols)]
            for a0, a1 in segs(-D / 2 - over, D / 2 + over, face, z + hc / 2):
                objs.append(log('ly', r, a1 - a0, (sgn * W / 2, (a0 + a1) / 2 + rnd.uniform(-0.02, 0.02),
                                                   z + hc / 2), rot=(90, 0, 0), bark=tonal(c, 0.1, 3.0), end=endm,
                                segs=14))
    top = r + (n - 1) * hc + hc / 2 + r
    # dark inner lining (fills the gaps between round logs; open where the doors are)
    inner = flat(inner_col, 0.9)
    t = 0.06
    for face, (cx, cy, sx, sy) in {'y-': (0, -D / 2 + 0.1, W - 0.1, t), 'y+': (0, D / 2 - 0.1, W - 0.1, t),
                                   'x-': (-W / 2 + 0.1, 0, t, D - 0.1), 'x+': (W / 2 - 0.1, 0, t, D - 0.1)}.items():
        c = cuts.get(face)
        if not c:
            objs.append(box('lining', (sx, sy, top), (cx, cy, 0), mat=inner, bevel=0.0))
            continue
        along_x = face[0] == 'y'
        full0, full1 = (-(W - 0.1) / 2, (W - 0.1) / 2) if along_x else (-(D - 0.1) / 2, (D - 0.1) / 2)
        for a0, a1 in ((full0, c[0]), (c[1], full1)):
            if a1 - a0 > 0.02:
                m = (a0 + a1) / 2
                objs.append(box('lining', (a1 - a0, sy, top) if along_x else (sx, a1 - a0, top),
                                (m, cy, 0) if along_x else (cx, m, 0), mat=inner, bevel=0.0))
        m = (c[0] + c[1]) / 2
        objs.append(box('lining', (c[1] - c[0], sy, top - c[2]) if along_x else (sx, c[1] - c[0], top - c[2]),
                        (m, cy, c[2]) if along_x else (cx, m, c[2]), mat=inner, bevel=0.0))
    return top, objs


def plank_door(name, w, h, col='#8A5A33', brace='#E8D2A8', x_brace=True):
    """Plank door leaf in its local XZ plane (hinge at x=0, opening toward +x), thickness along -Y."""
    m = L.stripes(col, hexmix(col, '#000000', 0.12), 5.0 / w, 'X', rough=0.8, soft=0.05)
    objs = [box(name, (w, 0.07, h), (w / 2, 0, 0), mat=m, bevel=0.02)]
    bm = flat(brace, 0.75)
    for z in (0.12, h - 0.18):
        objs.append(box(name + '_rail', (w - 0.04, 0.05, 0.1), (w / 2, -0.05, z), mat=bm, bevel=0.015))
    if x_brace:
        ln = math.hypot(w - 0.1, h - 0.4)
        ang = math.degrees(math.atan2(h - 0.4, w - 0.1))
        for s in (-1, 1):
            objs.append(box(name + '_x', (ln, 0.05, 0.09), (w / 2, -0.05, h / 2), rot=(0, s * ang, 0), mat=bm,
                            bevel=0.015, origin='center'))
    return objs


def sack(name, loc, s=1.0, col='#D8C39A', seed=0, tie='#C8463D'):
    o1 = blob(name, 0.24 * s, (loc[0], loc[1], loc[2] + 0.2 * s), flat(col, 0.9), scale=(1.0, 0.82, 0.95),
              seed=seed, amp=0.14, subdiv=3, flat_bottom=0.55)
    o2 = cyl(name + '_neck', 0.06 * s, 0.1 * s, (loc[0], loc[1], loc[2] + 0.4 * s), mat=flat(col, 0.9), segs=10,
             r_top=0.09 * s)
    o3 = cyl(name + '_tie', 0.065 * s, 0.035 * s, (loc[0], loc[1], loc[2] + 0.42 * s), mat=flat(tie, 0.7), segs=10)
    return [o1, o2, o3]


WAREHOUSE_NOTE = ('Warehouse (3x3 m): big log barn with a gambrel roof; its gable end faces screen down-left (world '
                  '-Y) with wide red X-braced barn doors standing open (crates / sacks / barrels inside and outside) '
                  'and a loft hoist above the doors. anims.work = the hoist lifts a sack bundle (pulley turning, '
                  'rope shortening) while the doors sway. staffPoints[0] = keeper beside the doors (in front of the '
                  'barn: draw above it). inPoint = drop-off pad (front-left), outPoint = pick-up pad (right side).')


def gambrel_roof(name, W, D, eave_z, knee_z, ridge_z, over, mat, seed=0, knee_f=0.5):
    """Barn (gambrel) roof along X: steep lower panels from the eaves to the knee at y = +-D/2*knee_f, shallow
    upper panels to the ridge.  Returns the gable outline [(y, z), ...] for the end walls."""
    ky = D / 2 * knee_f
    slope = (knee_z - eave_z) / (D / 2 - ky)
    z_out = eave_z - over * slope
    out = []
    for s in (-1, 1):
        out += LA.roof(name + 'L%d' % s, W, s * (D / 2 + over), z_out, s * ky, knee_z, 0.1, mat, snow_frac=0.35,
                       seed=seed + (s > 0))
        out += LA.roof(name + 'U%d' % s, W, s * (ky + 0.02), knee_z - 0.02, 0.0, ridge_z, 0.1, mat, snow_frac=0.9,
                       seed=seed + 2 + (s > 0))
        out.append(log(name + '_knee', 0.05, W + 0.04, (0, s * ky, knee_z + 0.06), rot=(0, 90, 0),
                       bark=flat('#6B3526', 0.8), end=flat('#6B3526', 0.8), segs=10))
    out.append(log(name + '_ridge', 0.07, W + 0.1, (0, 0, ridge_z + 0.1), rot=(0, 90, 0), bark=flat('#6B3526', 0.8),
                   end=flat('#6B3526', 0.8), segs=12))
    out.append(L.snow_slab(name + '_rsnow', W - 0.05, 0.3, 0.09, (0, 0, ridge_z + 0.11), seed=seed + 5))
    return [(-D / 2, eave_z), (-ky, knee_z), (0.0, ridge_z), (ky, knee_z), (D / 2, eave_z)]


@bld('warehouse', 'building', 'bld_buildings', fp=(3.0, 3.0), yaw=-90.0, front='-Y', catcher=22.0, work=4, fps=6,
     notes=WAREHOUSE_NOTE)
def b_warehouse():
    # local frame: the door gable faces local +X; yaw -90 turns it toward world -Y (screen down-left)
    W, D = 2.55, 2.55
    door = (-0.78, 0.78, 1.75)
    top, _ = log_walls_cut(W, D, 1.75, r=0.135, seed=21, over=0.18, cuts={'x+': door},
                           cols=('#B07038', '#A0632F', '#BC7B42'))
    knee, ridge = top + 0.95, top + 1.45
    roofm = L.stripes('#8A3B2E', '#7A3328', 4.0, 'Y', rough=0.85, soft=0.04)
    prof = gambrel_roof('roof', W + 0.7, D, top, knee, ridge, 0.3, roofm, seed=22)
    gm = L.stripes('#B5503A', '#A3452F', 3.0, 'Y', rough=0.85, soft=0.04)
    for s in (-1, 1):
        g = extrude('gable', [(y, z - top + 0.02) for y, z in prof], 0.12, rot=(90, 0, 90), top=gm, side=gm,
                    bevel=0.02)
        g.location = (s * (W / 2 + 0.02) - 0.06, 0, top - 0.02)
    trim = flat('#F1E6D0', 0.75)
    # white trim along the gable edges (door side)
    for (y0, z0), (y1, z1) in zip(prof, prof[1:]):
        ln = math.hypot(y1 - y0, z1 - z0)
        ang = math.degrees(math.atan2(z1 - z0, y1 - y0))
        box('gtrim', (0.08, ln + 0.06, 0.08), (W / 2 + 0.1, (y0 + y1) / 2, (z0 + z1) / 2), rot=(ang, 0, 0), mat=trim,
            bevel=0.015, origin='center')
    # floor inside + interior goods (seen through the open doors)
    box('floor', (W - 0.15, D - 0.15, 0.04), (0, 0, 0.0), mat=L.stripes('#A87442', '#946336', 3.0, 'Y', soft=0.04),
        bevel=0.0)
    PA.crate_model('ic1', 0.62, (-0.2, -0.65, 0.04), snow=False, seed=1)
    PA.crate_model('ic2', 0.55, (-0.25, -0.62, 0.66), rot=(0, 0, 10), snow=False, seed=2)
    PA.crate_model('ic3', 0.6, (-0.75, 0.55, 0.04), snow=False, seed=3)
    sack('is1', (0.25, 0.5, 0.04), 1.0, seed=31)
    sack('is2', (-0.2, 0.75, 0.04), 0.9, seed=32, col='#CDB68A')
    sack('is3', (0.45, 0.05, 0.04), 0.85, seed=34)
    PA.barrel_model('ib', loc=(-0.65, -0.05, 0.04), scale=0.75, snow=False, seed=4)
    L.point_light('inlamp', (0.5, 0.0, 1.4), 'window', 22.0, 0.3)
    # door frame + two big red X-braced doors
    xd = W / 2 + 0.16
    for s in (-1, 1):
        box('jamb', (0.16, 0.14, door[2] + 0.12), (xd, s * (door[1] + 0.06), 0.0), mat=trim, bevel=0.03)
    box('lintel', (0.2, door[1] * 2 + 0.42, 0.18), (xd, 0, door[2]), mat=trim, bevel=0.03)
    L.snow_slab('lsnow', 0.22, door[1] * 2 + 0.3, 0.06, (xd, 0, door[2] + 0.18), seed=6)
    leaves = []
    for s in (-1, 1):
        objs = plank_door('leaf', door[1] - 0.02, door[2] - 0.04, col='#B5503A', brace='#F1E6D0')
        g = L.group(objs, 'door%d' % s)
        hinge = L.group([g], 'hinge%d' % s, loc=(xd + 0.08, s * (door[1] + 0.04), 0.02))
        # the +y leaf is folded back against the wall (it would hide the doorway from the camera); the -y leaf
        # stands open toward the viewer
        g.rotation_euler.z = math.radians(84 if s > 0 else -18)
        leaves.append((s, hinge))
    # loft door + hoist beam under the gable peak
    lz = top + 0.2
    dark = flat('#2A1E18', 0.95)
    box('loft', (0.1, 0.6, 0.62), (W / 2 + 0.09, 0, lz), mat=dark, bevel=0.0)
    box('loftfr', (0.12, 0.76, 0.08), (W / 2 + 0.11, 0, lz + 0.62), mat=trim, bevel=0.02)
    box('loftsill', (0.16, 0.76, 0.08), (W / 2 + 0.12, 0, lz - 0.06), mat=trim, bevel=0.02)
    hz = ridge - 0.2
    hx1 = W / 2 + 1.0
    log('hoistbeam', 0.1, hx1 - (W / 2 - 0.4), ((hx1 + W / 2 - 0.4) / 2, 0, hz), rot=(0, 90, 0),
        bark=tonal('#7C4D2C', 0.12, 5.0), segs=12)
    L.snow_slab('hbsnow', hx1 - W / 2 + 0.1, 0.16, 0.06, ((hx1 + W / 2) / 2 + 0.05, 0, hz + 0.09), seed=7)
    iron = flat('#3D424C', 0.45, 0.6)
    box('pblock', (0.1, 0.16, 0.28), (hx1 - 0.14, 0, hz - 0.36), mat=iron, bevel=0.02)
    wheel_parts = [cyl('pw', 0.15, 0.06, (0, 0, 0), rot=(90, 0, 0), mat=flat('#C98F55', 0.7), segs=20,
                       origin='center', bevel=0.012)]
    for k in range(3):
        wheel_parts.append(box('spoke', (0.27, 0.07, 0.035), (0, 0, 0), rot=(0, 60 * k, 0), mat=iron, bevel=0.0,
                               origin='center'))
    pulley = L.group(wheel_parts, 'pulley', loc=(hx1 - 0.14, 0.0, hz - 0.4))
    rope_m = flat('#D9C39A', 0.8)
    ropes = []
    with L.Collect() as lc:
        sack('hs1', (-0.13, 0.0, -0.52), 0.8, seed=41)
        sack('hs2', (0.13, 0.05, -0.52), 0.75, seed=42, col='#CDB68A')
        cyl('hook', 0.03, 0.12, (0, 0, -0.12), mat=iron, segs=8)
    load = regroup(lc.objs, 'load', loc=(hx1 - 0.14 + 0.15, 0.0, 1.6))
    # outside: crate stack + sacks + barrel by the door, snow drifts
    PA.crate_model('oc1', 0.6, (W / 2 + 0.55, -1.32, 0), seed=5)
    PA.crate_model('oc2', 0.5, (W / 2 + 0.52, -1.3, 0.6), rot=(0, 0, -12), seed=6)
    sack('os1', (W / 2 + 0.85, 1.3, 0), 0.95, seed=33)
    PA.barrel_model('ob', loc=(W / 2 + 0.35, 1.45, 0), scale=0.72, seed=8)
    PA.lantern('wlan', (W / 2 + 0.25, door[1] + 0.32, 1.55), 0.14, 3.0)
    LA.snow_drift('d1', 0.32, (-W / 2 - 0.2, -1.2, 0.0), seed=13)
    LA.snow_drift('d2', 0.26, (-0.9, D / 2 + 0.3, 0.0), seed=14)
    # side window on local +Y (world +X, the visible right side)
    window('swin', (-0.3, D / 2 + 0.15, 1.42), 'y+', w=0.6, h=0.52, shutters='#B5503A', seed=8)
    hz_low = [1.75, 2.0, 2.25, 2.0]

    def set_load(z):
        load.location.z = z
        for r_ in ropes:
            bpy.data.objects.remove(r_, do_unlink=True)
        ropes.clear()
        x_ = hx1 - 0.14 + 0.15
        ropes.append(L.tube('rope', [(x_, 0.0, hz - 0.4), (x_, 0.0, z)], 0.02, rope_m))
        ropes.append(L.tube('rope2', [(hx1 - 0.14 - 0.15, 0.0, hz - 0.4), (W / 2 + 0.14, 0.12, lz + 0.3)], 0.02,
                            rope_m))
        for r_ in ropes:
            r_.parent = bpy.data.objects.get('BldRoot')

    def idle():
        set_load(hz_low[0])
        pulley.rotation_euler.y = 0.0
        for s, h in leaves:
            h.rotation_euler.z = 0.0

    def work(i):
        set_load(hz_low[i])
        pulley.rotation_euler.y = math.radians(40.0 * i)
        for s, h in leaves:
            h.rotation_euler.z = math.radians([0.0, -5.0, -9.0, -5.0][i] * (1 if s < 0 else 0.4))

    idle()
    mark('staff', (W / 2 + 0.55, door[1] + 0.85, 0.0), facing=(1, 0, 0))
    mark('in', (2.6, -0.9, 0.0))
    mark('out', (0.9, 2.6, 0.0))
    mark('door', (W / 2 + 0.75, 0.0, 0.0), facing=(1, 0, 0))
    return {'idle': idle, 'work': work,
            'fx': {'hoist': (hx1 - 0.14, 0.0, hz - 0.4), 'door': (W / 2 + 0.3, 0.0, 0.9)}}


def half_timber(name, size, loc, plaster='#F1E6CF', beam='#5E3A22', braces=True):
    """Plaster wall block with dark timber beams on its -Y and +X faces (and posts at the corners)."""
    sx, sy, sz = size
    x, y, z = loc
    objs = [box(name, size, loc, mat=flat(plaster, 0.85), bevel=0.02)]
    bm = flat(beam, 0.8)
    t = 0.09
    for fy in (y - sy / 2 - 0.02,):
        objs.append(box(name + '_b', (sx + 0.04, t, t), (x, fy, z + sz - t), mat=bm, bevel=0.015))
        objs.append(box(name + '_b', (sx + 0.04, t, t), (x, fy, z), mat=bm, bevel=0.015))
        n = max(2, int(round(sx / 0.7)))
        for k in range(n + 1):
            xx = x - sx / 2 + sx * k / n
            objs.append(box(name + '_p', (t, t, sz), (xx, fy, z), mat=bm, bevel=0.015))
            if braces and k < n:
                ln = math.hypot(sx / n, sz)
                ang = math.degrees(math.atan2(sz, sx / n)) * (1 if k % 2 else -1)
                objs.append(box(name + '_x', (ln - 0.08, t * 0.8, t * 0.8), (xx + sx / n / 2, fy - 0.005, z + sz / 2),
                                rot=(0, ang, 0), mat=bm, bevel=0.012, origin='center'))
    fx = x + sx / 2 + 0.02
    objs.append(box(name + '_b', (t, sy + 0.04, t), (fx, y, z + sz - t), mat=bm, bevel=0.015))
    objs.append(box(name + '_b', (t, sy + 0.04, t), (fx, y, z), mat=bm, bevel=0.015))
    n = max(2, int(round(sy / 0.7)))
    for k in range(n + 1):
        yy = y - sy / 2 + sy * k / n
        objs.append(box(name + '_p', (t, t, sz), (fx, yy, z), mat=bm, bevel=0.015))
        if braces and k < n:
            ln = math.hypot(sy / n, sz)
            ang = math.degrees(math.atan2(sz, sy / n)) * (1 if k % 2 else -1)
            objs.append(box(name + '_x', (t * 0.8, ln - 0.08, t * 0.8), (fx + 0.005, yy + sy / n / 2, z + sz / 2),
                            rot=(-ang, 0, 0), mat=bm, bevel=0.012, origin='center'))
    return objs


CANNERY_NOTE = ('Cannery (3x3 m): brick + half-timber workshop with a slate roof, a giant tin can on the ridge, a '
                'brick chimney. In front (screen down-left) a conveyor runs along world +X: fish crate at the left '
                '(input) end, a can-sealing press in the middle, sealed cans stacked at the right (output) end. '
                'anims.work = cans travel along the belt (seamless), the press stamps, lamp blinks, steam + chimney '
                'smoke. inPoint = fish/ingot pad (front-left), outPoint = cans pad (right). fxPoints: press, steam, '
                'smoke, input, output.')


@bld('station_cannery', 'station', 'bld_buildings', fp=(3.0, 3.0), front='-Y', catcher=22.0, work=4, fps=8,
     notes=CANNERY_NOTE)
def b_station_cannery():
    rnd = L.rng(51)
    W, Y0, Y1 = 2.6, -0.05, 1.35
    D = Y1 - Y0
    yc = (Y0 + Y1) / 2
    brickm = L.brick('#B4593F', '#94442F', '#D9CFC2', scale=2.6, row_h=0.42, brick_w=0.5, snow_top=False)
    box('plinth', (W + 0.12, D + 0.12, 0.12), (0, yc, 0), mat=snowy('#8E96A3', lo=0.75, hi=0.9), bevel=0.03)
    box('brickwall', (W, D, 1.05), (0, yc, 0.1), mat=brickm, bevel=0.03)
    half_timber('upper', (W - 0.04, D - 0.04, 1.05), (0, yc, 1.15))
    top = 2.2
    roofm = L.stripes('#4E6A8A', '#425B78', 4.0, 'Y', rough=0.8, soft=0.04)
    rz = top + 0.95
    g = gable_roof('roof', W + 0.5, D, top, rz, 0.3, roofm, snow_frac=(0.6, 0.62), seed=52, ridge_col='#34465C')
    for o in top_level(g):
        o.location.y += yc
    for s in (-1, 1):
        gable_end('gable', D + 0.02, top - 0.01, rz, s * (W / 2 - 0.03), flat('#F1E6CF', 0.85)).location.y += yc
    # windows (upper floor, front + right side)
    for x in (-0.75, 0.75):
        window('fwin%d' % (x > 0), (x, Y0 - 0.02, 1.95), 'y-', w=0.5, h=0.45, shutters=None, seed=3)
    window('swin', (W / 2 + 0.02, yc, 1.95), 'x+', w=0.5, h=0.45, shutters=None, seed=4)
    # big double door (closed, green) on the front lower wall, behind the conveyor
    box('door', (0.9, 0.08, 0.95), (-0.75, Y0 - 0.03, 0.1), mat=L.stripes('#3E7F55', '#346B47', 6.0, 'X', soft=0.05),
        bevel=0.02)
    # giant tin can sign on the ridge
    box('signbase', (0.5, 0.36, 0.12), (0, yc, rz + 0.08), mat=flat('#5E3A22', 0.8), bevel=0.03)
    can_model('bigcan', r=0.33, h=0.5, loc=(0, yc, rz + 0.2), label='#D9483B', fish=True)
    L.snow_slab('cansnow', 0.5, 0.5, 0.06, (0, yc, rz + 0.73), seed=9)
    # brick chimney (back right) + steam pipe
    chx, chy = 0.9, 1.0
    cyl('chimney', 0.2, 2.25, (chx, chy, 1.5), mat=L.brick('#B4593F', '#94442F', '#D9CFC2', scale=3.2, row_h=0.4,
                                                               snow_top=False), segs=18, bevel=0.02)
    cyl('chimcap', 0.25, 0.12, (chx, chy, 3.72), mat=flat('#3D424C', 0.5, 0.4), segs=18)
    cyl('chimhole', 0.16, 0.012, (chx, chy, 3.84), mat=flat('#241C18', 0.9), segs=16, bevel=0.0)
    # ---- conveyor along +X in front of the building
    cy_ = -0.72
    cz = 0.72
    frame_m = flat('#5C7FA8', 0.45, 0.25)
    belt_m = L.stripes('#3A3F4A', '#2E323B', 10.0, 'X', rough=0.6, soft=0.05)
    x0, x1 = -1.42, 1.42
    for s in (-1, 1):
        box('rail', (x1 - x0, 0.07, 0.14), (0, cy_ + s * 0.29, cz - 0.1), mat=frame_m, bevel=0.02)
    box('belt', (x1 - x0 - 0.05, 0.52, 0.06), (0, cy_, cz - 0.06), mat=belt_m, bevel=0.015)
    for x in (x0 + 0.06, x1 - 0.06):
        cyl('roller', 0.07, 0.6, (x, cy_, cz - 0.05), rot=(90, 0, 0), mat=flat('#9AA4B2', 0.35, 0.7), segs=16,
            origin='center')
    for x in (x0 + 0.15, -0.6, 0.6, x1 - 0.15):
        for s in (-1, 1):
            box('leg', (0.08, 0.08, cz - 0.1), (x, cy_ + s * 0.27, 0), mat=frame_m, bevel=0.015)
    # ---- sealing press in the middle (two side plates + head box, piston, gauge, lamp)
    px_ = 0.05
    for s in (-1, 1):
        box('plate', (0.5, 0.08, 1.05), (px_, cy_ + s * 0.33, cz - 0.15), mat=frame_m, bevel=0.03)
    box('head', (0.62, 0.78, 0.36), (px_, cy_, cz + 0.85), mat=flat('#6E8FB5', 0.4, 0.3), bevel=0.06)
    box('headtrim', (0.66, 0.82, 0.06), (px_, cy_, cz + 0.85), mat=flat('#F2C14E', 0.35, 0.6), bevel=0.02)
    L.snow_slab('presssnow', 0.5, 0.66, 0.06, (px_, cy_, cz + 1.2), seed=11)
    cyl('gauge', 0.1, 0.04, (px_ - 0.12, cy_ - 0.4, cz + 1.03), rot=(90, 0, 0), mat=flat('#F4F1EA', 0.4),
        segs=20, origin='center', cap_mat=flat('#F4F1EA', 0.4))
    cyl('gaugerim', 0.115, 0.03, (px_ - 0.12, cy_ - 0.39, cz + 1.03), rot=(90, 0, 0), mat=flat('#2B2F3A', 0.4),
        segs=20, origin='center')
    needle = box('needle', (0.015, 0.02, 0.08), (0, 0, 0), mat=flat('#D9483B', 0.5), bevel=0.0)
    ng = L.group([needle], 'needleg', loc=(px_ - 0.12, cy_ - 0.43, cz + 1.03))
    lamp_m = L.emissive('lamp', '#7A2A20', '#FF5A3A', 0.0)
    sphere('lamp', 0.06, (px_ + 0.18, cy_ - 0.4, cz + 1.08), lamp_m, segs=14, rings=8)
    piston = cyl('piston', 0.07, 0.5, (0, 0, -0.5), mat=flat('#C3CCD8', 0.25, 0.8), segs=16)
    stamp = box('stamp', (0.3, 0.3, 0.1), (0, 0, -0.55), mat=flat('#9AA4B2', 0.3, 0.75), bevel=0.02)
    press = L.group([piston, stamp], 'press', loc=(px_, cy_, cz + 0.85))
    # steam pipe from the press head
    mb = L.MB()
    pm = flat('#9AA4B2', 0.35, 0.7)
    mb.seg(Vector((px_ + 0.2, cy_ + 0.2, cz + 1.2)), Vector((px_ + 0.2, cy_ + 0.2, cz + 1.75)), 0.05, pm, segs=12)
    mb.done('steampipe')
    cyl('pipecap', 0.07, 0.06, (px_ + 0.2, cy_ + 0.2, cz + 1.75), mat=pm, segs=12)
    # ---- input crate with fish (left end) + output tray of cans (right end)
    PA.crate_model('fishcrate', 0.55, (x0 - 0.1, cy_ - 0.05, 0), snow=False, seed=5)
    for i, (dx, dy, rz_) in enumerate(((-0.05, -0.05, 30), (0.08, 0.1, 110), (0.0, 0.05, 70))):
        PA.fish_model('cf%d' % i, loc=(x0 - 0.1 + dx, cy_ - 0.05 + dy, 0.6 + 0.06 * i), rot=(0, 0, rz_), scale=0.5)
    box('tray', (0.62, 0.62, 0.1), (x1 + 0.12, cy_ + 0.05, 0), mat=flat('#A87442', 0.8), bevel=0.02)
    for i, (dx, dy, dz) in enumerate(((-0.13, -0.13, 0), (0.13, -0.13, 0), (-0.13, 0.13, 0), (0.13, 0.13, 0),
                                      (0.0, 0.0, 0.16), (-0.02, -0.15, 0.16))):
        if i == 5:
            continue
        can_model('outcan%d' % i, r=0.11, h=0.15, loc=(x1 + 0.12 + dx, cy_ + 0.05 + dy, 0.1 + dz),
                  label=['#D9483B', '#3D7CC9'][i % 2], fish=i % 2 == 0, lid=True)
    # ---- cans on the belt (pool: open cans left of the press, sealed cans right of it)
    pitch = 0.36
    pool = []
    fish_top = flat('#F08A5D', 0.5)
    for k in range(9):
        with L.Collect() as oc:
            can_model('open%d' % k, r=0.1, h=0.14, loc=(0, 0, 0), label='#C3CCD8', fish=False, lid=False)
            cyl('fill%d' % k, 0.085, 0.01, (0, 0, 0.135), mat=fish_top, segs=18, bevel=0.0)
        og = regroup(oc.objs, 'openc%d' % k)
        sc = can_model('sealed%d' % k, r=0.1, h=0.14, loc=(0, 0, 0), label=['#D9483B', '#3D7CC9'][k % 2],
                       fish=False, lid=True)
        pool.append((og, sc))

    def set_cans(i):
        for k, (og, sc) in enumerate(pool):
            x = x0 + 0.12 + pitch * k + pitch / 4.0 * i
            vis = x < x1 - 0.1
            is_open = x < px_ - 0.05
            for o, on in ((og, vis and is_open), (sc, vis and not is_open)):
                show(descendants([o]), on)
                o.location = (x, cy_, cz - 0.03)

    steam = L.Smoke('steam', (px_ + 0.2, cy_ + 0.2, cz + 1.85), n=3, rise=0.9, drift=(0.18, 0.1), r0=0.12, r1=0.3,
                    color='#F4F7FB', alpha=0.85, seed=5, fade_in=0.15)
    smoke = L.Smoke('csmoke', (chx, chy, 3.85), n=3, rise=1.0, drift=(0.28, 0.12), r0=0.12, r1=0.34,
                    color='#A7AEB8', alpha=0.88, seed=6)
    glow = L.point_light('lampglow', (px_ + 0.25, cy_ - 0.6, cz + 1.1), '#FF5A3A', 0.0, 0.1)
    stroke = [0.0, -0.12, -0.24, -0.12]

    def idle():
        set_cans(0)
        press.location.z = cz + 0.85
        steam.show(False)
        smoke.show(False)
        L.set_emission(lamp_m, 0.3)
        glow.data.energy = 0.0
        ng.rotation_euler.y = math.radians(-40)

    def work(i):
        set_cans(i)
        press.location.z = cz + 0.85 + stroke[i]
        steam.set(i)
        smoke.set(i)
        on = i in (1, 2)
        L.set_emission(lamp_m, 4.0 if on else 0.8)
        glow.data.energy = 12.0 if on else 2.0
        ng.rotation_euler.y = math.radians([10, 35, 50, 30][i])

    idle()
    mark('in', (-0.9, -2.6, 0.0))
    mark('out', (2.6, -0.9, 0.0))
    return {'idle': idle, 'work': work,
            'fx': {'press': (px_, cy_, cz + 0.2), 'steam': (px_ + 0.2, cy_ + 0.2, cz + 2.1),
                   'smoke': (chx, chy, 4.1), 'input': (x0 - 0.1, cy_, 0.7), 'output': (x1 + 0.12, cy_, 0.5)}}


SMITH_NOTE = ('Toolsmith / forge (3x3 m): open timber smithy with a stone forge + brick hood and chimney, leather '
              'bellows, a cam-driven trip hammer over the anvil, a quench trough and a tool rack with axes, picks '
              'and sickles. anims.work = hammer rises and strikes (spark burst on the strike frame), bellows pump, '
              'coals pulse, chimney smoke, steam from the trough. staffPoints[0] = the smith at the forge front '
              '(draw above the building). inPoint = ingot+plank pad (front-left), outPoint = tools pad (right).')


@bld('station_toolsmith', 'station', 'bld_buildings', fp=(3.0, 3.0), front='-Y', catcher=22.0, work=4, fps=8,
     notes=SMITH_NOTE)
def b_station_toolsmith():
    rnd = L.rng(61)
    # floor of flagstones
    box('floor', (2.7, 2.5, 0.06), (-0.15, 0.25, 0), mat=L.brick('#7A828E', '#6C7380', '#5E6570', scale=1.2, row_h=0.5,
                                                                    brick_w=0.5, snow_top=False), bevel=0.02)
    wood = tonal('#7C4D2C', 0.12, 4.0)
    plank = L.stripes('#8A5A33', '#7A4D2B', 3.2, 'X', rough=0.85, soft=0.03)
    plank_y = L.stripes('#8A5A33', '#7A4D2B', 3.2, 'Y', rough=0.85, soft=0.03)
    XB0, XB1, YB0, YB1 = -1.4, 0.95, -0.55, 1.3
    H = 2.15
    box('backwall', (XB1 - XB0, 0.1, H), ((XB0 + XB1) / 2, YB1, 0.06), mat=plank, bevel=0.02)
    box('leftwall', (0.1, YB1 - YB0, H), (XB0, (YB0 + YB1) / 2, 0.06), mat=plank_y, bevel=0.02)
    for x, y in ((XB0, YB0), (XB1, YB0), (XB1, YB1), (XB0, YB1)):
        box('post', (0.16, 0.16, H + 0.1), (x, y, 0.0), mat=wood, bevel=0.03)
    box('beamF', (XB1 - XB0 + 0.2, 0.14, 0.16), ((XB0 + XB1) / 2, YB0, H - 0.05), mat=wood, bevel=0.03)
    box('beamR', (0.14, YB1 - YB0 + 0.2, 0.16), (XB1, (YB0 + YB1) / 2, H - 0.05), mat=wood, bevel=0.03)
    roofm = L.stripes('#5A4636', '#4C3A2C', 4.5, 'Y', rough=0.85, soft=0.04)
    ycr = (YB0 + YB1) / 2
    g = gable_roof('roof', XB1 - XB0 + 0.55, YB1 - YB0, H + 0.08, H + 0.95, 0.3, roofm, snow_frac=(0.6, 0.6),
                   seed=62, ridge_col='#3E3026')
    for o in top_level(g):
        o.location.x += (XB0 + XB1) / 2
        o.location.y += ycr
    for x in (XB0 - 0.02, XB1 + 0.02):
        gable_end('gable', YB1 - YB0 + 0.04, H + 0.07, H + 0.95, x, plank_y).location.y += ycr
    # ---- forge: stone hearth + coal bed + brick hood + chimney
    fx_, fy_ = -0.6, 0.72
    stone = L.brick('#8E96A3', '#7A828E', '#B9BFC8', scale=2.0, row_h=0.45, brick_w=0.55, snow_top=False)
    box('hearth', (1.15, 0.95, 0.78), (fx_, fy_, 0.06), mat=stone, bevel=0.04)
    box('hearthtop', (1.25, 1.05, 0.08), (fx_, fy_, 0.84), mat=flat('#6C7380', 0.8), bevel=0.03)
    box('coalpit', (0.8, 0.62, 0.04), (fx_, fy_ - 0.05, 0.9), mat=flat('#2E2724', 0.95), bevel=0.0)
    coal_m = L.emissive('forgecoal', '#5A2014', 'fire', 1.0)
    for i in range(22):
        blob('coal', rnd.uniform(0.05, 0.08), (fx_ + rnd.uniform(-0.33, 0.33), fy_ - 0.05 + rnd.uniform(-0.24, 0.24),
                                                0.93), coal_m if i % 3 else flat('#2E2724', 0.9), seed=70 + i,
             amp=0.3, subdiv=1, facet=True)
    hood_m = L.brick('#B4593F', '#94442F', '#D9CFC2', scale=2.6, row_h=0.42, snow_top=False)
    box('hood', (1.1, 0.9, 0.55), (fx_, fy_ + 0.05, 1.45), mat=hood_m, bevel=0.04, taper=(0.5, 0.5))
    box('hoodlip', (1.16, 0.96, 0.08), (fx_, fy_ + 0.05, 1.42), mat=flat('#5E4A44', 0.7), bevel=0.02)
    box('chimney', (0.42, 0.42, 1.95), (fx_, fy_ + 0.05, 1.95), mat=hood_m, bevel=0.03)
    box('chimcap', (0.52, 0.52, 0.1), (fx_, fy_ + 0.05, 3.9), mat=flat('#5E4A44', 0.7), bevel=0.02)
    L.snow_slab('chsnow', 0.48, 0.48, 0.06, (fx_, fy_ + 0.05, 4.0), seed=63)
    box('chimhole', (0.28, 0.28, 0.02), (fx_, fy_ + 0.05, 4.0), mat=flat('#241C18', 0.9), bevel=0.0)
    # ---- bellows beside the forge (+X side), nozzle into the hearth
    bx_, by_ = 0.22, 0.78
    box('bstand', (0.5, 0.6, 0.45), (bx_, by_, 0.06), mat=wood, bevel=0.03)
    leather = flat('#8B5A35', 0.75)
    bot = box('bbot', (0.75, 0.48, 0.05), (bx_ - 0.05, by_, 0.51), mat=flat('#A86A36', 0.8), bevel=0.015)
    bag = box('bbag', (0.62, 0.42, 1.0), (0, 0, 0), mat=leather, bevel=0.04, taper=(0.55, 0.9))
    bag_g = L.group([bag], 'bagg', loc=(bx_ - 0.02, by_, 0.54))
    lid_parts = [box('blid', (0.75, 0.48, 0.05), (0.0, 0, 0.0), mat=flat('#A86A36', 0.8), bevel=0.015),
                 cyl('bhandle', 0.03, 0.4, (0.42, 0, 0.03), rot=(0, 90, 0), mat=wood, segs=8, origin='center')]
    lid = L.group(lid_parts, 'blidg', loc=(bx_ - 0.05, by_, 0.75))
    del bot
    cyl('nozzle', 0.04, 0.35, (bx_ - 0.38, by_, 0.6), rot=(0, -90, 0), mat=flat('#5A606B', 0.4, 0.6), segs=10)
    # ---- anvil on a stump + glowing blade + trip hammer
    ax_, ay_ = 0.08, -0.6
    cyl('stump', 0.28, 0.42, (ax_, ay_, 0.04), mat=tonal('#6E4428', 0.15, 6.0), segs=18, cap_mat=L.end_grain())
    iron = flat('#3D424C', 0.4, 0.7)
    az = 0.46
    box('abase', (0.36, 0.26, 0.12), (ax_, ay_, az), mat=iron, bevel=0.02, taper=(0.75, 0.75))
    box('awaist', (0.2, 0.16, 0.14), (ax_, ay_, az + 0.12), mat=iron, bevel=0.02)
    box('atop', (0.52, 0.24, 0.12), (ax_, ay_, az + 0.26), mat=iron, bevel=0.03)
    cyl('ahorn', 0.085, 0.24, (ax_ - 0.36, ay_, az + 0.32), rot=(0, -90, 0), r_top=0.01, mat=iron, segs=12,
        origin='center')
    hot_m = L.emissive('hotblade', '#C9542A', '#FF8A2A', 1.0)
    box('hotblade', (0.36, 0.1, 0.035), (ax_ + 0.02, ay_, az + 0.38), mat=hot_m, bevel=0.012)
    pvx, pvz = 0.78, 1.0
    box('hpost', (0.16, 0.16, pvz + 0.15), (pvx, ay_, 0.04), mat=wood, bevel=0.03)
    box('hpost2', (0.3, 0.3, 0.12), (pvx, ay_, 0.04), mat=wood, bevel=0.03)
    arm = [box('hbeam', (0.95, 0.12, 0.12), (-0.42, 0, 0), mat=wood, bevel=0.025, origin='center'),
           box('hhead', (0.26, 0.24, 0.3), (-0.8, 0, -0.1), mat=iron, bevel=0.035, origin='center'),
           box('hband', (0.28, 0.26, 0.05), (-0.8, 0, 0.0), mat=flat('#F2C14E', 0.35, 0.6), bevel=0.01,
               origin='center'),
           box('htail', (0.3, 0.1, 0.1), (0.2, 0, 0), mat=wood, bevel=0.02, origin='center'),
           cyl('hpin', 0.04, 0.22, (0, 0, 0), rot=(90, 0, 0), mat=flat('#C3CCD8', 0.3, 0.7), segs=10, origin='center')]
    hammer = L.group(arm, 'hammer', loc=(pvx, ay_, pvz + 0.06))
    # cam wheel behind the post that trips the hammer tail
    wheel = [cyl('cw', 0.28, 0.08, (0, 0, 0), rot=(90, 0, 0), mat=tonal('#9A6638', 0.1, 4.0), segs=24, origin='center',
                 bevel=0.02)]
    for k in range(4):
        wheel.append(box('cam', (0.12, 0.1, 0.1), (0.3 * math.cos(k * math.pi / 2), 0, 0.3 * math.sin(k * math.pi / 2)),
                         mat=iron, bevel=0.02, origin='center'))
    for k in range(2):
        wheel.append(box('cspoke', (0.5, 0.05, 0.05), (0, -0.045, 0), rot=(0, 90 * k + 45, 0), mat=iron, bevel=0.0,
                         origin='center'))
    camw = L.group(wheel, 'camwheel', loc=(pvx + 0.42, ay_ - 0.08, 0.72))
    box('camstand', (0.12, 0.12, 0.72), (pvx + 0.42, ay_ + 0.06, 0.04), mat=wood, bevel=0.02)
    # spark burst (strike frame + fly-out frame)
    spark_m = L.emissive('sparks', '#FFD45A', '#FFC24A', 4.0)
    sparks = []
    for k in range(12):
        a = math.tau * k / 12 + rnd.uniform(-0.2, 0.2)
        el = rnd.uniform(0.2, 1.1)
        d = Vector((math.cos(a) * math.cos(el), math.sin(a) * math.cos(el) * 0.8, math.sin(el)))
        o = blob('spark%d' % k, 0.03, (0, 0, 0), spark_m, seed=90 + k, amp=0.3, subdiv=1, facet=True)
        o.visible_shadow = False
        sparks.append((o, d, rnd.uniform(0.7, 1.2)))
    spark_c = Vector((ax_ - 0.05, ay_, az + 0.45))
    # ---- quench trough (front left) + tool rack (right) + barrel of handles
    tx_, ty_ = -1.0, -0.62
    box('trough', (0.7, 0.42, 0.42), (tx_, ty_, 0.04), mat=L.stripes('#9A6638', '#8A5A33', 6.0, 'X', soft=0.04),
        bevel=0.03)
    box('water', (0.6, 0.32, 0.02), (tx_, ty_, 0.42), mat=flat('#4F86C2', 0.12), bevel=0.0)
    rack_x = 1.25
    box('rackboard', (0.08, 1.0, 1.05), (rack_x, 0.55, 0.55), mat=L.stripes('#B27843', '#A06A3A', 3.0, 'Y',
                                                                             soft=0.04), bevel=0.02)
    for y in (0.15, 0.95):
        box('rackleg', (0.1, 0.1, 1.6), (rack_x, y, 0.0), mat=wood, bevel=0.02)
    L.snow_slab('racksnow', 0.12, 1.0, 0.05, (rack_x, 0.55, 1.6), seed=64)
    axe_model('rack_axe', s=0.55, loc=(rack_x + 0.07, 0.3, 1.18), rot=(0, -90, 90))
    pick_model('rack_pick', s=0.48, loc=(rack_x + 0.07, 0.62, 1.12), rot=(0, -90, 90))
    sickle_model('rack_sickle', s=0.55, loc=(rack_x + 0.07, 0.9, 1.25), rot=(0, -90, 90))
    PA.barrel_model('hbarrel', loc=(1.3, -0.16, 0.0), scale=0.6, snow=False, seed=9)
    for i, (dx, dy, ry, rz_) in enumerate(((-0.05, 0.0, -78, 10), (0.06, 0.05, -72, -30), (0.0, -0.06, -84, 60))):
        cyl('handle%d' % i, 0.03, 0.55, (1.3 + dx, -0.16 + dy, 0.3), rot=(0, 90 + ry, rz_),
            mat=tonal('#C98F55', 0.08, 3.0), segs=8)
    # ingot + plank supply by the forge (input side)
    for i in range(3):
        PA.ingot_model('sing%d' % i, loc=(-1.05 + 0.02 * i, 0.2, 0.08 + 0.09 * i), rot=(0, 0, 90 + 8 * i), scale=0.55)
    for i in range(3):
        box('splank%d' % i, (0.7, 0.24, 0.06), (-0.95, -0.15, 0.08 + 0.065 * i), rot=(0, 0, 90 + 5 * i),
            mat=flat(['plank', '#E0AA6C', 'wood_light'][i], 0.75), bevel=0.02)
    # ---- motion
    flames = L.Flames('fflame', [((fx_ - 0.2, fy_ - 0.1, 0.92), 0.08, 0.26), ((fx_ + 0.05, fy_ - 0.02, 0.92), 0.09, 0.32),
                                 ((fx_ + 0.25, fy_ - 0.15, 0.92), 0.07, 0.24)], lean=0.1)
    fglow = L.point_light('forgeglow', (fx_ + 0.3, fy_ - 0.5, 1.1), 'fire', 10.0, 0.3)
    aglow = L.point_light('anvilglow', (ax_ + 0.1, ay_ - 0.25, az + 0.6), 'fire', 0.0, 0.1)
    smoke = L.Smoke('fsmoke', (fx_, fy_ + 0.05, 4.05), n=3, rise=1.0, drift=(0.28, 0.12), r0=0.12, r1=0.34,
                    color='#A7AEB8', alpha=0.88, seed=8)
    steam = L.Smoke('qsteam', (tx_, ty_, 0.5), n=3, rise=0.6, drift=(0.1, 0.05), r0=0.07, r1=0.2, color='#F4F7FB',
                    alpha=0.7, seed=9, fade_in=0.2)
    beam_ang = [18.0, 26.0, -6.0, 8.0]
    bell = [0.62, 0.42, 0.26, 0.42]

    def set_sparks(i):
        for k, (o, d, sp) in enumerate(sparks):
            if i == 2:
                p = spark_c + d * 0.13 * sp
                sc = 1.3
            elif i == 3:
                p = spark_c + d * 0.42 * sp + Vector((0, 0, -0.08 * sp))
                sc = 0.8
            else:
                show([o], False)
                continue
            show([o], True)
            o.location = p
            o.scale = (sc, sc, sc)

    def idle():
        hammer.rotation_euler.y = math.radians(-10.0)
        camw.rotation_euler.y = 0.0
        lid.rotation_euler.y = 0.0
        bag_g.scale = (1, 1, 0.21)
        lid.location.z = 0.54 + 0.21
        set_sparks(0)
        flames.show(False)
        smoke.show(False)
        steam.show(False)
        L.set_emission(coal_m, 0.9)
        L.set_emission(hot_m, 0.6)
        fglow.data.energy = 6.0
        aglow.data.energy = 0.0

    def work(i):
        hammer.rotation_euler.y = math.radians(-beam_ang[i])
        camw.rotation_euler.y = math.radians(-22.5 * i)
        h = bell[i] * 0.5
        bag_g.scale = (1, 1, h)
        lid.location.z = 0.54 + h
        lid.rotation_euler.y = math.radians(-6 * (bell[i] - 0.26) / 0.36)
        set_sparks(i)
        flames.set(i)
        smoke.set(i)
        steam.set(i)
        s = [1.6, 2.2, 3.0, 2.4][i]
        L.set_emission(coal_m, s)
        L.set_emission(hot_m, [1.6, 1.8, 3.2, 2.4][i])
        fglow.data.energy = 14 + 8 * s
        aglow.data.energy = [4.0, 4.0, 30.0, 12.0][i]

    idle()
    mark('staff', (-1.2, -1.2, 0.0), facing=(1, 0.35, 0))
    mark('in', (-0.9, -2.6, 0.0))
    mark('out', (2.6, -0.9, 0.0))
    return {'idle': idle, 'work': work,
            'fx': {'fire': (fx_, fy_ - 0.05, 1.0), 'sparks': tuple(spark_c), 'smoke': (fx_, fy_ + 0.05, 4.3),
                   'steam': (tx_, ty_, 0.6)}}


def net_mat(rope='#EFE9DA', fill='#5E7FA6', cells=16.0):
    """Fishing-net look: rope crosshatch over a dark blue-grey bag (fish inside)."""
    key = ('net', rope, fill, cells)
    if key in L._CUSTOM:
        return L._CUSTOM[key]
    nb = L.NB('net', rough=0.85)
    tc = nb.n('ShaderNodeTexCoord')
    sep = nb.n('ShaderNodeSeparateXYZ')
    nb.link(tc.outputs['Object'], sep.inputs[0])
    a = nb.math('FRACT', nb.math('MULTIPLY', nb.math('ADD', sep.outputs['X'], sep.outputs['Z']), cells))
    b = nb.math('FRACT', nb.math('MULTIPLY', nb.math('SUBTRACT', sep.outputs['Y'], sep.outputs['Z']), cells))
    la = nb.map_range(nb.math('ABSOLUTE', nb.math('SUBTRACT', a, 0.5)), 0.36, 0.42)
    lb = nb.map_range(nb.math('ABSOLUTE', nb.math('SUBTRACT', b, 0.5)), 0.36, 0.42)
    line = nb.math('MAXIMUM', la, lb)
    nb.base(nb.mix_rgb(line, C(fill), C(rope)))
    L._CUSTOM[key] = nb.m
    return nb.m


def wreath(name, loc, r=0.13):
    """Evergreen door wreath with a red bow (faces -Y)."""
    mb = L.MB()
    g1, g2 = flat('#2E6B4F', 0.8), flat('#3E7F55', 0.8)
    for k in range(14):
        a = math.tau * k / 14
        mb.ico(0.05, g1 if k % 2 else g2, loc=(r * math.cos(a), 0, r * math.sin(a)), subdiv=1)
    for k in range(4):
        a = math.tau * k / 4 + 0.4
        mb.sphere(0.022, flat('#D9483B', 0.4), loc=(r * 1.05 * math.cos(a), -0.04, r * 1.05 * math.sin(a)), segs=8,
                  rings=5)
    w = mb.done(name, smooth=False)
    bow = [sphere(name + '_bow', 0.05, (s * 0.05, -0.05, -r), flat('#D9483B', 0.6), scale=(1.2, 0.5, 0.8), segs=10,
                  rings=6) for s in (-1, 1)]
    return L.group([w] + bow, name + 'g', loc=loc)


HOUSE_A_NOTE = ('Cosy log cabin (2.2 x 2.2 m) with a red snowy roof, stone chimney, a wreath on the door (front = '
                'screen down-left, world -Y), blue-shuttered window on the right side, firewood pile and lantern. '
                'Chimney smoke is drawn by the game at fxPoints.smoke; doorPoint = in front of the door.')


@bld('house_a', 'building', 'bld_buildings', fp=(2.2, 2.2), front='-Y', catcher=18.0, notes=HOUSE_A_NOTE)
def b_house_a():
    W, D, r = 1.82, 1.6, 0.12
    door = (-0.38, 0.38, 1.22)
    top, _ = log_walls_cut(W, D, 1.4, r=r, seed=71, over=0.17, cuts={'y-': door},
                           cols=('#C08049', '#B5763F', '#CC8A52'))
    ridge = top + 1.0
    roofm = L.stripes('#C0473A', '#A93C31', 4.0, 'Y', rough=0.75, soft=0.04)
    gable_roof('roof', W + 0.6, D, top, ridge, 0.34, roofm, snow_frac=(0.6, 0.64), seed=72, ridge_col='#8E2F27')
    gm = L.stripes('#A86A36', '#94592C', 3.5, 'Y', rough=0.85, soft=0.04)
    for s in (-1, 1):
        gable_end('gable', D + 0.05, top - 0.02, ridge, s * (W / 2 + 0.02), gm, thick=0.1)
    # door (closed) in the cut, frame, wreath, step
    trim = flat('#5E3A22', 0.8)
    yd = -D / 2
    box('door', (0.74, 0.08, 1.2), (0, yd, 0.03), mat=L.stripes('#7A4A2A', '#6A3E22', 6.0, 'X', soft=0.05),
        bevel=0.02)
    for s in (-1, 1):
        box('jamb', (0.1, 0.14, 1.28), (s * 0.42, yd - 0.05, 0.0), mat=trim, bevel=0.025)
    box('lintel', (0.98, 0.16, 0.12), (0, yd - 0.05, 1.24), mat=trim, bevel=0.025)
    L.snow_slab('lsnow', 0.95, 0.14, 0.05, (0, yd - 0.05, 1.36), seed=3)
    sphere('knob', 0.04, (0.24, yd - 0.07, 0.62), flat('gold', 0.3, 0.8), segs=10, rings=6)
    wreath('wreath', (0, yd - 0.07, 0.86))
    box('step', (0.95, 0.42, 0.1), (0, yd - r - 0.2, 0), mat=snowy('stone', lo=0.6, hi=0.8), bevel=0.04)
    # windows: right side (+X) + a small one on the front left
    window('swin', (W / 2 + r + 0.02, 0.0, 1.2), 'x+', w=0.56, h=0.5, seed=4)
    # stone chimney through the back-left of the roof
    cx, cy = -0.45, 0.32
    sm = L.brick('#8E96A3', '#7A828E', '#C7CDD5', scale=3.0, row_h=0.45, snow_top=False)
    box('chimney', (0.4, 0.4, ridge - top + 0.75), (cx, cy, top - 0.1), mat=sm, bevel=0.03)
    box('chimcap', (0.5, 0.5, 0.09), (cx, cy, ridge + 0.62), mat=snowy('#8E96A3', lo=0.75, hi=0.9), bevel=0.03)
    box('chimhole', (0.24, 0.24, 0.02), (cx, cy, ridge + 0.71), mat=flat('#241C18', 0.9), bevel=0.0)
    # firewood + lantern + snow drifts
    PA.log_pile('fw', 3, 0.1, 0.6, (W / 2 + 0.45, 0.55, 0), seed=12)
    PA.lantern('lan', (-0.62, yd - 0.22, 1.25), 0.13, 3.0)
    box('lanarm', (0.04, 0.24, 0.04), (-0.62, yd - 0.1, 1.55), mat=trim, bevel=0.0)
    LA.snow_drift('d1', 0.25, (-W / 2 - 0.15, -0.6, 0.0), seed=21)
    LA.snow_drift('d2', 0.2, (0.6, yd - 0.45, 0.0), seed=22, scale=(1.4, 0.9, 0.3))
    mark('door', (0.0, yd - 0.6, 0.0), facing=(0, 1, 0))
    return {'fx': {'smoke': (cx, cy, ridge + 0.85), 'chimney': (cx, cy, ridge + 0.72)}}


HOUSE_B_NOTE = ('Stone cottage (2.5 x 2.5 m): rounded grey stone walls, blue slate roof with snow, arched wooden door '
                'with a stone arch, round porthole window + berry window box on the front, tall stone chimney on the '
                'right gable (smoke at fxPoints.smoke). Front = screen down-left (world -Y).')


@bld('house_b', 'building', 'bld_buildings', fp=(2.5, 2.5), front='-Y', catcher=18.0, notes=HOUSE_B_NOTE)
def b_house_b():
    W, D, Hw = 2.0, 1.75, 1.45
    box('core', (W - 0.12, D - 0.12, Hw), (0, 0, 0), mat=flat('#7A828E', 0.85), bevel=0.0)
    PA.stone_ring(0, 0, W, D, courses=6, h=0.25, seed=81, stone_l=0.44, depth=0.3,
                  cols=('#9AA2AD', '#8A929D', '#A6ADB7', '#8E8B88'), snow_top=True)
    top = Hw + 0.05
    ridge = top + 1.15
    roofm = L.stripes('#3F5F8A', '#36527A', 5.0, 'Y', rough=0.7, soft=0.04)
    gable_roof('roof', W + 0.6, D + 0.1, top, ridge, 0.32, roofm, snow_frac=(0.62, 0.66), seed=82, ridge_col='#2B4466')
    pm = flat('#E8DFCC', 0.85)
    for s in (-1, 1):
        gable_end('gable', D + 0.15, top - 0.03, ridge, s * (W / 2 + 0.05), pm, thick=0.12)
    yd = -D / 2 - 0.16
    # arched door (right of centre) with a stone arch
    dx = 0.38
    wood = L.stripes('#7A4A2A', '#6A3E22', 7.0, 'X', soft=0.05)
    d = extrude('door', PA.arch_pts(0.64, 1.18, 12), 0.08, rot=PA.facing_rot(0), top=wood, side=wood, bevel=0.02)
    d.location = (dx, yd + 0.02, 0.03)
    PA.voussoir_arch('arch', (dx, yd + 0.06, 0.0), 0.0, 0.64, 1.18, depth=0.18, block=0.14, n=9,
                     mat=snowy('#C9CED6', lo=0.75, hi=0.9))
    iron = flat('#3D424C', 0.5, 0.5)
    for z in (0.3, 0.85):
        box('hinge', (0.36, 0.03, 0.05), (dx - 0.14, yd - 0.07, z), mat=iron, bevel=0.0)
    sphere('ring', 0.04, (dx + 0.18, yd - 0.08, 0.6), flat('gold', 0.3, 0.8), segs=10, rings=6)
    box('step', (0.9, 0.4, 0.1), (dx, yd - 0.25, 0), mat=snowy('stone', lo=0.6, hi=0.8), bevel=0.04)
    # round window front-left + berry window box
    window('rwin', (-0.48, yd + 0.04, 1.3), 'y-', w=0.5, round_=True, seed=5)
    box('wbox', (0.62, 0.2, 0.16), (-0.48, yd - 0.1, 0.62), mat=flat('#A86A36', 0.8), bevel=0.03)
    for k in range(7):
        sphere('leaf', 0.06, (-0.72 + 0.08 * k, yd - 0.1, 0.8), flat('#2E6B4F', 0.8), scale=(1, 0.8, 0.8), segs=10,
               rings=6)
        if k % 2 == 0:
            sphere('berry', 0.035, (-0.72 + 0.08 * k, yd - 0.17, 0.84), flat('#D9483B', 0.4), segs=8, rings=6)
    window('swin', (W / 2 + 0.16, -0.25, 1.25), 'x+', w=0.5, h=0.48, shutters='#3F5F8A', seed=6)
    # stone chimney stack on the right gable, rising above the ridge
    cx, cy = W / 2 + 0.24, 0.35
    sm = L.brick('#9AA2AD', '#8A929D', '#C9CED6', scale=2.4, row_h=0.4, brick_w=0.5, snow_top=False)
    box('chimney', (0.42, 0.5, ridge + 0.55), (cx, cy, 0.0), mat=sm, bevel=0.04, taper=(0.85, 0.85))
    box('chimcap', (0.46, 0.54, 0.1), (cx, cy, ridge + 0.55), mat=snowy('#8E96A3', lo=0.75, hi=0.9), bevel=0.03)
    box('chimhole', (0.24, 0.3, 0.02), (cx, cy, ridge + 0.65), mat=flat('#241C18', 0.9), bevel=0.0)
    PA.lantern('lan', (dx + 0.48, yd - 0.06, 1.15), 0.12, 3.0)
    PA.barrel_model('br', loc=(-W / 2 - 0.15, yd - 0.05, 0), scale=0.55, seed=6)
    LA.snow_drift('d1', 0.24, (-0.95, 0.95, 0.0), seed=31)
    LA.snow_drift('d2', 0.2, (1.05, -0.95, 0.0), seed=32, scale=(1.4, 0.9, 0.3))
    mark('door', (dx, yd - 0.6, 0.0), facing=(0, 1, 0))
    return {'fx': {'smoke': (cx, cy, ridge + 0.9), 'chimney': (cx, cy, ridge + 0.66)}}


HOUSE_C_NOTE = ('Tall half-timbered cottage (2 x 2 m): cream plaster + dark beams, steep green roof with its gable '
                'toward the viewer (front = screen down-left, world -Y), round attic window, door canopy, brick '
                'chimney (smoke at fxPoints.smoke), potted pine and lantern.')


@bld('house_c', 'building', 'bld_buildings', fp=(2.0, 2.0), front='-Y', catcher=18.0, notes=HOUSE_C_NOTE)
def b_house_c():
    W, D, Hw = 1.6, 1.55, 1.6
    box('plinth', (W + 0.14, D + 0.14, 0.14), (0, 0, 0), mat=snowy('#8E96A3', lo=0.75, hi=0.9), bevel=0.03)
    half_timber('walls', (W, D, Hw), (0, 0, 0.12), plaster='#F3E9D2', beam='#5A3A26')
    top = Hw + 0.12
    ridge = top + 1.35
    roofm = L.stripes('#3E7F55', '#346B47', 5.0, 'Y', rough=0.75, soft=0.04)
    with L.Collect() as rc:
        gable_roof('roof', D + 0.55, W, top, ridge, 0.32, roofm, snow_frac=(0.6, 0.62), seed=91, ridge_col='#2E5E40')
    regroup(rc.objs, 'roofg', rot=(0, 0, 90))
    # gable ends facing -Y / +Y (cream plaster with a timber cross) + round attic window on the front
    pm = flat('#F3E9D2', 0.85)
    for s in (-1, 1):
        g = extrude('gable', [(-W / 2 - 0.04, 0.0), (W / 2 + 0.04, 0.0), (0.0, ridge - top)], 0.1, rot=(90, 0, 0),
                    top=pm, side=pm, bevel=0.02)
        g.location = (0, s * D / 2 + (0.05 if s > 0 else 0.05), top - 0.01)
    bm = flat('#5A3A26', 0.8)
    box('gbeam', (W + 0.06, 0.08, 0.09), (0, -D / 2 - 0.07, top), mat=bm, bevel=0.015)
    box('gpost', (0.08, 0.08, ridge - top - 0.15), (0, -D / 2 - 0.07, top), mat=bm, bevel=0.015)
    window('attic', (0.0, -D / 2 - 0.08, top + 0.78), 'y-', w=0.42, round_=True, seed=7)
    # door with a little canopy, window on the right side with a flower box
    yd = -D / 2 - 0.02
    box('door', (0.62, 0.08, 1.12), (-0.25, yd - 0.04, 0.14), mat=L.stripes('#3E7F55', '#346B47', 6.0, 'X',
                                                                            soft=0.05), bevel=0.02)
    sphere('knob', 0.035, (-0.06, yd - 0.1, 0.7), flat('gold', 0.3, 0.8), segs=10, rings=6)
    LA.roof('canopy', 0.9, yd - 0.45, 1.36, yd, 1.55, 0.06, roofm, snow_frac=0.8, seed=92)
    for s in (-1, 1):
        box('bracket', (0.05, 0.4, 0.05), (-0.25 + s * 0.38, yd - 0.2, 1.33), rot=(-30, 0, 0), mat=bm, bevel=0.0)
    box('step', (0.8, 0.36, 0.12), (-0.25, yd - 0.22, 0), mat=snowy('stone', lo=0.6, hi=0.8), bevel=0.04)
    window('fwin', (0.45, yd - 0.04, 1.32), 'y-', w=0.42, h=0.46, shutters='#3E7F55', seed=8)
    window('swin', (W / 2 + 0.05, 0.05, 1.32), 'x+', w=0.5, h=0.48, shutters='#3E7F55', seed=9)
    box('fbox', (0.16, 0.6, 0.15), (W / 2 + 0.12, 0.05, 0.66), mat=flat('#A86A36', 0.8), bevel=0.03)
    for k in range(6):
        sphere('flw', 0.055, (W / 2 + 0.13, -0.18 + 0.09 * k, 0.83), flat(['#D9483B', '#F2C14E'][k % 2], 0.6),
               segs=10, rings=6)
    # brick chimney through the left (-X) slope, toward the back
    cx, cy = -0.42, 0.35
    box('chimney', (0.36, 0.36, ridge - top + 0.55), (cx, cy, top + 0.1),
        mat=L.brick('#B4593F', '#94442F', '#D9CFC2', scale=3.0, row_h=0.42, snow_top=False), bevel=0.03)
    box('chimcap', (0.44, 0.44, 0.08), (cx, cy, ridge + 0.65), mat=flat('#5E4A44', 0.7), bevel=0.02)
    box('chimhole', (0.2, 0.2, 0.02), (cx, cy, ridge + 0.73), mat=flat('#241C18', 0.9), bevel=0.0)
    # potted pine + lantern + drift
    cyl('pot', 0.17, 0.26, (0.45, yd - 0.3, 0), mat=flat('#B4593F', 0.7), r_top=0.2, segs=18, bevel=0.02)
    with L.Collect() as pc:
        PA.pine(seed=7, tiers=3, base_r=0.55, top_z=1.55, tier_h=0.75, first_z=0.35, snow_f=0.6, tips=7, trunk_r=0.08)
    regroup(pc.objs, 'potpine', loc=(0.45, yd - 0.3, 0.2)).scale = (0.55, 0.55, 0.55)
    PA.lantern('lan', (-0.72, yd - 0.12, 1.1), 0.12, 3.0)
    LA.snow_drift('d1', 0.22, (0.85, 0.9, 0.0), seed=41)
    mark('door', (-0.25, yd - 0.6, 0.0), facing=(0, 1, 0))
    return {'fx': {'smoke': (cx, cy, ridge + 0.95), 'chimney': (cx, cy, ridge + 0.74)}}


BOATHOUSE_NOTE = ('Boathouse (3 x 2 m): blue plank boat shed with a red roof, its open gable doorway toward the viewer '
                  '(screen down-left) shows a rowboat on a cradle; crossed oars + fish sign above the door, life ring '
                  'on the side. A small pier runs along the right side toward world +Y (screen up-right = the sea) '
                  'and sticks out ~1 m past the footprint; a jib crane at its end. anims.work = the crane winch '
                  'turns and lifts a net of fish, stove-pipe smoke. dockPoint/dockDir = where a boat (anchor) moors '
                  'beside the pier end; outPoint = catch pad on land (front right).')


@bld('boathouse', 'building', 'bld_buildings', fp=(3.0, 2.0), front='-Y', catcher=20.0, work=4, fps=6,
     notes=BOATHOUSE_NOTE)
def b_boathouse():
    rnd = L.rng(101)
    sx0, sx1, sy0, sy1 = -1.45, 0.2, -0.85, 0.85
    W, D = sx1 - sx0, sy1 - sy0
    xc = (sx0 + sx1) / 2
    Hw = 1.55
    walls = L.stripes('#5E8FB0', '#4F7E9E', 5.0, 'X', rough=0.8, soft=0.04)
    walls_y = L.stripes('#5E8FB0', '#4F7E9E', 5.0, 'Y', rough=0.8, soft=0.04)
    trim = flat('#F1EADB', 0.75)
    box('floor', (W, D, 0.08), (xc, 0, 0), mat=L.stripes('#A87442', '#946336', 3.0, 'X', soft=0.04), bevel=0.0)
    door_w, door_h = 1.15, 1.4
    t = 0.1
    box('wback', (W, t, Hw), (xc, sy1 - t / 2, 0.0), mat=walls, bevel=0.02)
    for s in (-1, 1):
        box('wside', (t, D, Hw), (xc + s * (W / 2 - t / 2), 0, 0.0), mat=walls_y, bevel=0.02)
    for s in (-1, 1):
        seg = (W - door_w) / 2
        box('wfront', (seg, t, Hw), (xc + s * (door_w / 2 + seg / 2), sy0 + t / 2, 0.0), mat=walls, bevel=0.02)
    box('wfront_top', (door_w, t, Hw - door_h), (xc, sy0 + t / 2, door_h), mat=walls, bevel=0.02)
    for x in (sx0, sx1):
        for y in (sy0, sy1):
            box('corner', (0.12, 0.12, Hw + 0.04), (x, y, 0.0), mat=trim, bevel=0.025)
    for s in (-1, 1):
        box('dtrim', (0.1, 0.12, door_h), (xc + s * (door_w / 2 + 0.03), sy0 - 0.01, 0.0), mat=trim, bevel=0.02)
    box('dtrimtop', (door_w + 0.26, 0.12, 0.1), (xc, sy0 - 0.01, door_h), mat=trim, bevel=0.02)
    box('inner', (W - 0.25, D - 0.25, 0.02), (xc, 0, Hw - 0.02), mat=flat('#2A1E18', 0.95), bevel=0.0)
    L.point_light('shedlamp', (xc, 0.2, 1.2), 'window', 10.0, 0.3)
    # roof: ridge along Y (gable toward the viewer), red, snowy
    ridge = Hw + 1.15
    roofm = L.stripes('#B4473A', '#9C3B30', 4.0, 'Y', rough=0.75, soft=0.04)
    with L.Collect() as rc:
        gable_roof('roof', D + 0.55, W, Hw, ridge, 0.3, roofm, snow_frac=(0.62, 0.62), seed=102, ridge_col='#7E2E26')
    regroup(rc.objs, 'roofg', loc=(xc, 0, 0), rot=(0, 0, 90))
    for s in (-1, 1):
        g = extrude('gable', [(-W / 2 - 0.02, 0.0), (W / 2 + 0.02, 0.0), (0.0, ridge - Hw)], 0.1, rot=(90, 0, 0),
                    top=walls, side=walls, bevel=0.02)
        g.location = (xc, s * D / 2 + 0.05, Hw - 0.01)
    # fish sign + crossed oars on the front gable
    sign = flat('#E8B87A', 0.7)
    box('sign', (0.66, 0.06, 0.3), (xc, sy0 - 0.06, Hw - 0.02), mat=sign, bevel=0.03)
    PA.fish_model('signfish', loc=(xc, sy0 - 0.11, Hw + 0.13), rot=(90, 0, 0), scale=0.5)
    # stored rowboat (the props boat_small model, read-only builder) on a cradle, bow out of the door
    with L.Collect() as bc_:
        PA.ASSETS['boat_small']['fn']()
    boatg = regroup(bc_.objs, 'storedboat', loc=(xc, -0.1, 0.18), rot=(0, 0, -90))
    boatg.scale = (0.6, 0.6, 0.6)
    for y in (-0.45, 0.35):
        box('cradle', (0.62, 0.12, 0.22), (xc, y, 0.06), mat=flat('#8A5A33', 0.8), bevel=0.02)
    # life ring + window on the visible +X wall
    ring = L.MB()
    for k in range(16):
        a0, a1 = math.tau * k / 16, math.tau * (k + 1) / 16
        p = Vector((0, 0.2 * math.cos(a0), 0.2 * math.sin(a0)))
        q = Vector((0, 0.2 * math.cos(a1), 0.2 * math.sin(a1)))
        ring.seg(p, q, 0.06, flat('#D9483B' if (k // 2) % 2 == 0 else '#F4F1EA', 0.5), segs=10)
    ring.done('lifering', loc=(sx1 + 0.07, -0.35, 0.95))
    window('swin', (sx1 + 0.05, 0.35, 1.25), 'x+', w=0.42, h=0.4, shutters=None, seed=11)
    # stove pipe on the back slope
    cyl('pipe', 0.07, 0.75, (xc - 0.35, 0.45, ridge - 0.55), mat=flat('#3D424C', 0.5, 0.5), segs=12)
    cyl('pipecap', 0.11, 0.08, (xc - 0.35, 0.45, ridge + 0.2), mat=flat('#3D424C', 0.5, 0.5), segs=12, r_top=0.05)
    # pier along the right side toward +Y
    px0, px1, py0, py1 = 0.42, 1.38, -0.85, 1.95
    dz = 0.32
    n = 13
    for i in range(n):
        y = py0 + (i + 0.5) * (py1 - py0) / n
        c = ['#C98F55', '#BD844C', '#D39A5E'][rnd.randrange(3)]
        box('pplank', (px1 - px0 + rnd.uniform(-0.04, 0.04), (py1 - py0) / n - 0.03, 0.07),
            ((px0 + px1) / 2 + rnd.uniform(-0.02, 0.02), y, dz), rot=(0, 0, rnd.uniform(-1.2, 1.2)), mat=flat(c, 0.8),
            bevel=0.02)
    for x in (px0 + 0.06, px1 - 0.06):
        box('stringer', (0.12, py1 - py0, 0.14), (x, (py0 + py1) / 2, dz - 0.14), mat=flat('wood_dark', 0.8),
            bevel=0.03)
        for y in (py0 + 0.1, 0.5, py1 - 0.1):
            h = 0.75 if y > py1 - 0.2 else 0.36
            cyl('ppost', 0.09, h, (x + (0.04 if x > 1 else -0.04), y, 0), mat=flat('#8A5A33', 0.8), segs=12,
                cap_mat=L.end_grain())
            if h > 0.5:
                PA.snow_cap('ppsnow', 0.08, (x + (0.04 if x > 1 else -0.04), y, h - 0.01), 0.05, int(y * 10))
    PA.crate_model('pcrate', 0.42, (0.95, -0.4, dz + 0.07), seed=7)
    PA.fish_model('pfish', loc=(0.95, -0.4, dz + 0.55), rot=(0, 0, 40), scale=0.45)
    PA.barrel_model('pbar', loc=(1.05, 0.25, dz + 0.07), scale=0.5, seed=8)
    cyl('bollard', 0.08, 0.26, (px1 - 0.18, 1.2, dz + 0.07), mat=flat('iron', 0.5, 0.5), segs=14)
    rope_c = L.MB()
    for k in range(3):
        rope_c.cone(0.13 - 0.025 * k, 0.13 - 0.025 * k, 0.035, flat('#D9C39A', 0.85), loc=(0.8, 0.85, dz + 0.1 + 0.035 * k),
                    segs=16)
    rope_c.done('ropecoil')
    # jib crane at the pier end, arm out over the water (+X)
    cpx, cpy = 1.1, 1.72
    wood = tonal('#7C4D2C', 0.12, 4.0)
    box('cpost', (0.14, 0.14, 1.75), (cpx, cpy, dz + 0.05), mat=wood, bevel=0.03)
    log('carm', 0.06, 1.05, (cpx + 0.42, cpy, dz + 1.72), rot=(0, 90, 0), bark=wood, segs=10)
    log('cbrace', 0.045, 0.75, (cpx + 0.25, cpy, dz + 1.45), rot=(0, 45, 0), bark=wood, segs=8)
    L.snow_slab('casnow', 0.95, 0.1, 0.04, (cpx + 0.42, cpy, dz + 1.77), seed=12)
    drum_parts = [cyl('drum', 0.11, 0.24, (0, 0, 0), rot=(90, 0, 0), mat=tonal('#9A6638', 0.1, 4.0), segs=16,
                      origin='center')]
    for k in range(4):
        drum_parts.append(box('dhandle', (0.04, 0.04, 0.32), (0, -0.14, 0), rot=(0, 90 * k, 0), mat=flat('iron', 0.5, 0.5),
                              bevel=0.0, origin='center'))
    drum = L.group(drum_parts, 'drumg', loc=(cpx - 0.12, cpy, dz + 0.85))
    hx = cpx + 0.88
    net_m = net_mat()
    with L.Collect() as nc:
        blob('netbag', 0.24, (0, 0, -0.26), net_m, scale=(1.0, 0.9, 1.1), seed=5, amp=0.15, subdiv=3)
        PA.fish_model('nf1', loc=(0.12, -0.12, -0.3), rot=(70, 0, 20), scale=0.4)
        PA.fish_model('nf2', loc=(-0.1, -0.14, -0.22), rot=(100, 10, 160), scale=0.36)
        cyl('nhook', 0.02, 0.1, (0, 0, -0.05), mat=flat('iron', 0.5, 0.5), segs=8)
    netg = regroup(nc.objs, 'netg', loc=(hx, cpy, dz + 1.0))
    rope_m = flat('#D9C39A', 0.8)
    ropes = []

    def set_net(z, swing):
        netg.location.z = z
        netg.rotation_euler.y = math.radians(swing)
        for r_ in ropes:
            bpy.data.objects.remove(r_, do_unlink=True)
        ropes.clear()
        ropes.append(L.tube('crope', [(hx, cpy, dz + 1.7), (hx + math.sin(math.radians(swing)) * 0.02, cpy, z - 0.02)],
                            0.014, rope_m))
        ropes.append(L.tube('crope2', [(cpx - 0.12, cpy - 0.0, dz + 0.95), (cpx, cpy, dz + 1.7), (hx - 0.05, cpy,
                                                                                                    dz + 1.74)],
                            0.012, rope_m))
        for r_ in ropes:
            r_.parent = bpy.data.objects.get('BldRoot')

    smoke = L.Smoke('bsmoke', (xc - 0.35, 0.45, ridge + 0.3), n=3, rise=0.9, drift=(0.25, 0.12), r0=0.08, r1=0.24,
                    color='#B7BDC6', alpha=0.85, seed=10)
    lift = [dz + 1.0, dz + 1.12, dz + 1.24, dz + 1.12]
    sw = [0.0, 4.0, 0.0, -4.0]

    def idle():
        set_net(dz + 0.95, 0.0)
        drum.rotation_euler.y = 0.0
        smoke.show(False)

    def work(i):
        set_net(lift[i], sw[i])
        drum.rotation_euler.y = math.radians(-30.0 * i)
        smoke.set(i)

    idle()
    PA.lantern('lan', (px0 + 0.05, py0 + 0.1, dz + 0.95), 0.12, 3.0)
    cyl('lpost', 0.04, 0.95, (px0 + 0.05, py0 + 0.1, dz + 0.0), mat=wood, segs=8)
    LA.snow_drift('d1', 0.24, (sx0 - 0.05, -1.0, 0.0), seed=51)
    mark('dock', (2.15, 1.15, 0.0), facing=(0, 1, 0))
    mark('out', (0.6, -2.0, 0.0))
    mark('door', (xc, sy0 - 0.55, 0.0), facing=(0, 1, 0))
    return {'idle': idle, 'work': work,
            'fx': {'crane': (hx, cpy, dz + 0.9), 'smoke': (xc - 0.35, 0.45, ridge + 0.55)}}


# =========================================================================== CONSTRUCTION SITES

SITE_SIZES = {'S': 2.0, 'M': 3.0, 'L': 4.0}
SITE_NOTE = ('Construction site %s (%g x %g m footprint): site_plot_%s = staked-out plot (stakes, rope, flags, packed '
             'snow), site_foundation_%s = stone foundation + a few planks, site_scaffold_%s = half-built timber frame '
             'inside scaffolding with a ladder and plank piles. All three share frameSize + anchor (= footprint '
             'centre), and so does any finished %s building: swap the sprite in place. workPoints/workDirs = where '
             'builders stand and hammer (outside the footprint, facing the site; draw them above the sprite); '
             'dropPoint = where delivered materials are stacked.')


def _site_builder(sz):
    def fn():
        a = SITE_SIZES[sz]
        h = a / 2.0
        rnd = L.rng(110 + int(a * 10))
        wood = tonal('#C98F55', 0.1, 3.0)
        dark = tonal('#8A5A33', 0.12, 4.0)
        with L.Collect() as base:
            box('pad', (a - 0.15, a - 0.15, 0.03), (0, 0, 0), mat=tonal('#B9C3D2', 0.1, 2.5), bevel=0.012)
            for k in range(int(a * 3)):
                blob('trodden', 0.16, (rnd.uniform(-h + 0.3, h - 0.3), rnd.uniform(-h + 0.3, h - 0.3), 0.0),
                     tonal('#9FA9B8', 0.1, 3.0), scale=(1.3, 1.0, 0.12), seed=140 + k, amp=0.3, subdiv=2)
        # ---- stage 0: plot (stakes + rope + flags + sign)
        with L.Collect() as plot:
            c = h - 0.12
            corners = [(-c, -c), (c, -c), (c, c), (-c, c)]
            tape = flat('#D9483B', 0.6)
            tops = []
            for i, (x, y) in enumerate(corners):
                cyl('stake', 0.07, 0.7, (x, y, 0), mat=wood, r_top=0.055, segs=12, cap_mat=L.end_grain())
                cyl('tape', 0.076, 0.1, (x, y, 0.5), mat=tape, segs=12, bevel=0.0)
                cyl('tape2', 0.072, 0.06, (x, y, 0.36), mat=flat('#F4F1EA', 0.6), segs=12, bevel=0.0)
                tops.append(Vector((x, y, 0.55)))
            rope = flat('#F4F1EA', 0.7)
            for i in range(4):
                p, q = tops[i], tops[(i + 1) % 4]
                m = (p + q) / 2 + Vector((0, 0, -0.1))
                L.smooth_tube('rope', [tuple(p), tuple(m), tuple(q)], 0.022, flat('#E8C25A', 0.7))
                # little pennants hanging from the rope
                for t in (0.3, 0.7):
                    pt = p + (q - p) * t
                    pt.z = 0.55 - 0.1 * 4 * t * (1 - t) - 0.01
                    d = (q - p).normalized()
                    f = extrude('pennant', [(-0.09, 0.0), (0.09, 0.0), (0.0, -0.17)], 0.012,
                                top=flat(['#F2C14E', '#D9483B'][(i + int(t * 2)) % 2], 0.6),
                                side=flat('#F2C14E', 0.6), bevel=0.0)
                    f.location = tuple(pt)
                    f.rotation_euler = Euler((math.radians(90), 0, math.atan2(d.y, d.x)), 'XYZ')
            # sign at the front-left corner: plank with a hammer icon
            sx_, sy_ = -c - 0.05, -c - 0.25
            cyl('signpost', 0.04, 0.95, (sx_, sy_, 0), mat=dark, segs=8)
            box('signboard', (0.5, 0.06, 0.34), (sx_ + 0.05, sy_ - 0.03, 0.62), mat=flat('#E8C79A', 0.75),
                bevel=0.03)
            box('ham_h', (0.04, 0.03, 0.22), (sx_ + 0.05, sy_ - 0.07, 0.66), rot=(0, 35, 0), mat=flat('#8A5A33', 0.7),
                bevel=0.0)
            box('ham_head', (0.14, 0.04, 0.07), (sx_ + 0.11, sy_ - 0.075, 0.83), rot=(0, 35, 0),
                mat=flat('#3D424C', 0.45, 0.6), bevel=0.01)
            L.snow_slab('signsnow', 0.46, 0.07, 0.04, (sx_ + 0.05, sy_ - 0.03, 0.96), seed=3)
            for i in range(3):
                PA.snow_cap('stakesnow', 0.06, (corners[i][0], corners[i][1], 0.7), 0.045, i)
        # ---- stage 1: foundation (dirt bed, stone ring, planks, stone pile)
        with L.Collect() as found:
            f = a - 0.55
            box('dirt', (f - 0.1, f - 0.1, 0.05), (0, 0, 0.0), mat=tonal('#8A6A50', 0.14, 3.0), bevel=0.02)
            PA.stone_ring(0, 0, f, f, courses=2, h=0.2, seed=120 + int(a), stone_l=0.36, depth=0.28,
                          cols=('#8E96A3', '#7F8794', '#A0A7B1', '#8E8B88'))
            for i in range(3):
                box('fplank', (min(1.25, a * 0.42), 0.24, 0.06), (-0.12 * a / 3 + rnd.uniform(-0.03, 0.03),
                                                                  -0.18 * a / 3, 0.05 + 0.065 * i),
                    rot=(0, 0, 10 + rnd.uniform(-4, 4)), mat=flat(['plank', '#E0AA6C', 'wood_light'][i], 0.75),
                    bevel=0.02)
            for i in range(5):
                blob('pstone', rnd.uniform(0.11, 0.15), (0.3 * a / 3 + rnd.uniform(-0.12, 0.12),
                                                         0.3 * a / 3 + rnd.uniform(-0.15, 0.15), 0.1 + 0.05 * (i // 3)),
                     snowy(['#8E96A3', '#7F8794'][i % 2], lo=0.7, hi=0.9), seed=130 + i, amp=0.2, subdiv=2,
                     flat_bottom=0.4)
            cyl('bucket', 0.13, 0.22, (-0.3 * a / 3, 0.35 * a / 3, 0.05), mat=flat('#9AA4B2', 0.4, 0.5), r_top=0.15, segs=16,
                cap_mat=flat('#5E6570', 0.6))
        # ---- stage 2: scaffold (timber frame + scaffolding + ladder + piles)
        Hf = {'S': 1.55, 'M': 1.85, 'L': 2.05}[sz]
        with L.Collect() as scaf:
            f = a - 0.55
            q = f / 2 - 0.08
            z0 = 0.38
            for x in (-q, q):
                for y in (-q, q):
                    box('fpost', (0.14, 0.14, Hf), (x, y, z0), mat=wood, bevel=0.025)
            for s in (-1, 1):
                box('topx', (f - 0.05, 0.13, 0.13), (0, s * q, z0 + Hf - 0.13), mat=wood, bevel=0.02)
                box('topy', (0.13, f - 0.05, 0.13), (s * q, 0, z0 + Hf - 0.13), mat=wood, bevel=0.02)
            endm = L.end_grain()
            for k in range(3):
                z = z0 + 0.12 + k * 0.23
                log('wallb', 0.11, f + 0.15, (0, q, z), rot=(0, 90, 0), bark=tonal('#B5763F', 0.1, 3.0), end=endm,
                    segs=12)
                log('walll', 0.11, f + 0.15, (-q, 0, z + 0.11), rot=(90, 0, 0), bark=tonal('#A86A36', 0.1, 3.0),
                    end=endm, segs=12)
            # one roof truss on the +X end + ridge pole
            rz = z0 + Hf + 0.75
            for (y0, y1) in ((-q, 0.0), (q, 0.0)):
                ln = math.hypot(y1 - y0, rz - (z0 + Hf))
                ang = math.degrees(math.atan2(rz - (z0 + Hf), y1 - y0))
                box('rafter', (0.11, ln, 0.11), (q, (y0 + y1) / 2, (rz + z0 + Hf) / 2), rot=(ang, 0, 0), mat=wood,
                    bevel=0.02, origin='center')
            box('ridgepole', (f * 0.6, 0.11, 0.11), (q - f * 0.3, 0.0, rz - 0.05), mat=wood, bevel=0.02)
            # scaffolding along the front (-Y) and right (+X) sides
            pole = flat('#D9B27A', 0.75)
            off = q + 0.38
            plat_z = z0 + 0.95
            mb = L.MB()
            n_seg = max(2, int(round(f / 0.9)))
            for side in ('front', 'right'):
                pts = []
                for k in range(n_seg + 1):
                    t = -q + 2 * q * k / n_seg
                    pts.append((t, -off) if side == 'front' else (off, t))
                for (x, y) in pts:
                    mb.seg(Vector((x, y, 0.0)), Vector((x, y, plat_z + 1.05)), 0.035, pole, segs=8)
                for z in (plat_z - 0.04, plat_z + 0.85):
                    p0, p1 = pts[0], pts[-1]
                    mb.seg(Vector((p0[0], p0[1], z)), Vector((p1[0], p1[1], z)), 0.03, pole, segs=8)
                p0, p1 = pts[0], pts[-1]
                mb.seg(Vector((p0[0], p0[1], 0.1)), Vector((p1[0], p1[1], plat_z - 0.05)), 0.025, pole, segs=6)
            mb.done('scaffold')
            box('walkF', (2 * q + 0.2, 0.32, 0.05), (0, -off + 0.12, plat_z), mat=L.stripes('#D39A5E', '#C08A50',
                                                                                             3.0, 'X', soft=0.04),
                bevel=0.012)
            box('walkR', (0.32, 2 * q + 0.2, 0.05), (off - 0.12, 0, plat_z), mat=L.stripes('#D39A5E', '#C08A50', 3.0,
                                                                                            'Y', soft=0.04),
                bevel=0.012)
            L.snow_slab('wsnow', 2 * q * 0.6, 0.28, 0.04, (-q * 0.2, -off + 0.12, plat_z + 0.05), seed=4)
            # ladder leaning on the front walkway (right end)
            lad = flat('#C98F55', 0.75)
            mb = L.MB()
            lx = q * 0.55
            for s in (-1, 1):
                mb.seg(Vector((lx + s * 0.18, -off - 0.55, 0.0)), Vector((lx + s * 0.18, -off - 0.05, plat_z + 0.45)),
                       0.03, lad, segs=6)
            for k in range(1, 6):
                t = k / 6.2
                mb.seg(Vector((lx - 0.18, -off - 0.55 + 0.5 * t, (plat_z + 0.45) * t)),
                       Vector((lx + 0.18, -off - 0.55 + 0.5 * t, (plat_z + 0.45) * t)), 0.022, lad, segs=5)
            mb.done('ladder')
            # plank pile + logs on the ground (back-left inside the footprint), sawhorse front-left
            for i in range(4):
                box('pile', (min(1.3, a * 0.42), 0.26, 0.06), (-h + 0.42 + 0.0, -h * 0.25 + rnd.uniform(-0.03, 0.03),
                                                               0.02 + 0.065 * i),
                    rot=(0, 0, 90 + rnd.uniform(-4, 4)), mat=flat(['plank', '#E0AA6C', 'wood_light', '#D39A5E'][i],
                                                                   0.75), bevel=0.02) if a >= 3 else None
            sh = [box('sawtop', (0.6, 0.1, 0.08), (0, 0, 0.42), mat=wood, bevel=0.02)]
            for s in (-1, 1):
                for t in (-1, 1):
                    sh.append(box('sawleg', (0.05, 0.05, 0.48), (s * 0.22, t * 0.1, 0.0), rot=(t * 14, 0, 0), mat=dark,
                                  bevel=0.0))
            L.group(sh, 'sawhorse', loc=(-q + 0.1, -off - 0.35, 0.0), rot=(0, 0, 20))
            PA.log_pile('logs', 3 if a < 3 else 4, 0.1, min(0.9, a * 0.28), (h - 0.35, h - 0.35, 0), seed=7,
                        snow=True) if a >= 3 else None
        objs_all = base.objs + plot.objs + found.objs + scaf.objs
        every = descendants(objs_all)

        def setter(groups):
            def f_():
                show(every, False)
                show(descendants(sum(groups, [])), True)
            return f_

        mark('work', (-a * 0.15, -h - 0.5, 0.0), facing=(0, 1, 0))
        mark('work', (h + 0.5, a * 0.12, 0.0), facing=(-1, 0, 0))
        if a >= 3:
            mark('work', (a * 0.2, -h - 0.55, 0.0), facing=(0, 1, 0))
        mark('drop', (h + 0.45, -h - 0.4, 0.0))
        names = ['site_plot_%s' % sz, 'site_foundation_%s' % sz, 'site_scaffold_%s' % sz]
        frames = [(names[0], setter([base.objs, plot.objs])),
                  (names[1], setter([base.objs, found.objs])),
                  (names[2], setter([base.objs, found.objs, scaf.objs]))]
        return {'frames': frames, 'sprites': {n: {'frame': n, 'stage': k} for k, n in enumerate(names)}}
    return fn


for _sz, _a in SITE_SIZES.items():
    bld('site_%s' % _sz, 'site', 'bld_sites', fp=(_a, _a), front='-Y', catcher=10.0 + 4 * _a,
        sprites=['site_plot_%s' % _sz, 'site_foundation_%s' % _sz, 'site_scaffold_%s' % _sz],
        notes=SITE_NOTE % (_sz, _a, _a, _sz, _sz, _sz, {'S': '2x2 (houses, watchtower)', 'M': '3x3 (warehouse, '
                                                                'cannery, shop, toolsmith, boathouse)',
                                                                'L': '4x4'}[_sz]))(_site_builder(_sz))


# =========================================================================== ITEMS (72 x 72, anchor (36, 54))

def _ground_item(objs, tilt=0.0, spin=0.0):
    """Group the item objects, spin them in their own plane (about local Z), tilt about the long X axis, turn 45 deg
    so +X runs screen-right, and drop the result so its lowest point touches z = 0 with the bbox centred on the
    origin (the item anchor = bottom centre)."""
    g1 = L.group(top_level(objs), 'item_spin', rot=(0, 0, spin))
    g = L.group([g1], 'item', rot=(tilt, 0, 45))
    bpy.context.view_layer.update()
    pts = L.world_points(descendants([g]))
    if pts:
        xs = [L.screen_xy(p)[0] for p in pts]
        zmin = min(p.z for p in pts)
        cx = (min(xs) + max(xs)) / 2 / 64.0            # screen-x centre -> shift along world (1,1)/sqrt2
        g.location = (-cx * math.sqrt(0.5), -cx * math.sqrt(0.5), -zmin)
    return g


@bld('item_can', 'item', 'bld_items', item={'thickness': 0.26}, samples=64,
     notes='Tin can of fish (통조림): red label, cream bands, orange fish decal toward the viewer, ring-pull lid.')
def b_item_can():
    with L.Collect() as c:
        can_model('can', r=0.22, h=0.26, label='#D9483B', fish=True, fish_psi=45.0)
    _ground_item(c.objs)


def tuna_model(name, length=1.0, height=0.44, thick=0.25):
    """Chubby cartoon tuna lying on its side (flank up): dark navy back, silver belly, yellow finlets, crescent
    tail.  Local +X = head, +Y = dorsal."""
    nb = L.NB(name + '_mat', rough=0.32)
    tc = nb.n('ShaderNodeTexCoord')
    sep = nb.n('ShaderNodeSeparateXYZ')
    nb.link(tc.outputs['Object'], sep.inputs[0])
    col = nb.mix_rgb(nb.map_range(sep.outputs['Y'], -0.12, 0.02), C('#EEF3F8'), C('#A9BDD3'))
    col = nb.mix_rgb(nb.map_range(sep.outputs['Y'], 0.03, 0.12), col, C('#24406E'))
    st = nb.map_range(nb.math('ABSOLUTE', nb.math('SUBTRACT', sep.outputs['Y'], 0.025)), 0.03, 0.012)
    col = nb.mix_rgb(nb.math('MULTIPLY', st, 0.55), col, C('#E8C25A'))
    nb.base(col)
    import bmesh
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=32, v_segments=18, radius=1.0)
    for v in bm.verts:
        x, y, z = v.co
        k = 1.0 - 0.45 * max(0.0, -x) ** 1.6              # taper toward the tail (-X)
        v.co = Vector((x * length * 0.36, y * height * 0.5 * k, z * thick * 0.5 * (0.85 + 0.15 * k)))
    objs = [L.finish(name + '_body', bm, [nb.m])]
    fin = flat('#2B4A78', 0.4)
    tl = length * 0.36
    tail = extrude(name + '_tail', [(0.0, 0.0), (-0.1, 0.06), (-0.2, 0.2), (-0.13, 0.04), (-0.13, -0.04),
                                    (-0.2, -0.2), (-0.1, -0.06)], thick * 0.3, top=fin, side=fin, bevel=0.02)
    tail.location = (-tl * 1.02, 0, -thick * 0.15)
    objs.append(tail)
    for sgn in (-1, 1):
        f1 = extrude(name + '_fin', [(-0.16, 0.0), (0.06, 0.0), (-0.08, 0.13)], thick * 0.25, top=fin, side=fin,
                     bevel=0.012)
        f1.location = (0.0, sgn * height * 0.42, -thick * 0.12)
        if sgn < 0:
            f1.scale = (1, -0.6, 1)
        objs.append(f1)
    ylw = flat('#F2C14E', 0.45)
    for k in range(5):
        x = -tl * 0.45 - k * tl * 0.1
        for sgn in (-1, 1):
            yy = sgn * height * 0.5 * (1.0 - 0.45 * (abs(x) / tl) ** 1.6) * 0.95
            fl = extrude(name + '_finlet', [(-0.025, 0.0), (0.025, 0.0), (-0.02, 0.05 * sgn)][::sgn], thick * 0.2,
                         top=ylw, side=ylw, bevel=0.006)
            fl.location = (x, yy, -thick * 0.1)
            objs.append(fl)
    pec = extrude(name + '_pec', [(0.0, 0.0), (-0.24, -0.06), (-0.22, -0.02)], 0.02, top=fin, side=fin, bevel=0.006)
    pec.location = (tl * 0.45, -0.02, thick * 0.44)
    objs.append(pec)
    ew, eb = flat('#FFFFFF', 0.3), flat('#1E2430', 0.2)
    objs.append(sphere(name + '_eye', 0.06, (tl * 0.66, 0.035, thick * 0.32), ew, scale=(1, 1, 0.45), segs=16, rings=10))
    objs.append(sphere(name + '_pupil', 0.04, (tl * 0.68, 0.035, thick * 0.36), eb, scale=(1, 1, 0.45), segs=12,
                       rings=8))
    objs.append(sphere(name + '_glint', 0.014, (tl * 0.66, 0.05, thick * 0.38), ew, segs=8, rings=6))
    gill = L.smooth_tube(name + '_gill', [(tl * 0.42, -height * 0.25, thick * 0.3), (tl * 0.36, 0, thick * 0.43),
                                          (tl * 0.42, height * 0.25, thick * 0.3)], 0.012, flat('#1E3458', 0.5))
    objs.append(gill)
    return objs


@bld('item_fish_big', 'item', 'bld_items', item={'thickness': 0.25}, samples=64,
     notes='Big tuna (참치) caught by boat: navy back, silver belly, yellow finlets, lying on its side.')
def b_item_fish_big():
    with L.Collect() as c:
        tuna_model('tuna', length=0.98, height=0.44, thick=0.25)
    _ground_item(c.objs)


TOOL_TILT = -120.0          # tools lean back 60 deg so their flat side faces the camera (reads like an icon)
TOOL_SPIN = -22.0           # handle runs from lower-left to upper-right, head on top


@bld('item_axe', 'item', 'bld_items', item={'thickness': 0.15}, samples=64,
     notes='Axe (tool item): chunky wooden handle + big steel head; head raised toward the back so it reads as an '
           'icon.')
def b_item_axe():
    with L.Collect() as c:
        axe_model('axe', s=0.92, head='#8E9AAA', metal=0.35)
    _ground_item(c.objs, TOOL_TILT, TOOL_SPIN)


@bld('item_pickaxe', 'item', 'bld_items', item={'thickness': 0.15}, samples=64,
     notes='Pickaxe (tool item): wooden handle + curved double iron pick head.')
def b_item_pickaxe():
    with L.Collect() as c:
        pick_model('pick', s=0.86)
    _ground_item(c.objs, TOOL_TILT, TOOL_SPIN)


@bld('item_sickle', 'item', 'bld_items', item={'thickness': 0.15}, samples=64,
     notes='Sickle (tool item): short handle + shiny crescent blade.')
def b_item_sickle():
    with L.Collect() as c:
        sickle_model('sickle', s=1.15, flat_blade=True)
    _ground_item(c.objs, TOOL_TILT, TOOL_SPIN)


@bld('item_rod', 'item', 'bld_items', item={'thickness': 0.15}, samples=64,
     notes='Fishing rod (tool item): cork grip, big red reel, short chunky rod with a red-white bobber.')
def b_item_rod():
    with L.Collect() as c:
        wood = flat('#5B3A24', 0.45)
        cork = flat('#D8A86A', 0.8)
        cyl('grip', 0.05, 0.3, (-0.5, 0, 0), rot=(0, 90, 0), mat=cork, segs=14, bevel=0.015)
        cyl('butt', 0.055, 0.05, (-0.53, 0, 0), rot=(0, 90, 0), mat=wood, segs=14, bevel=0.012)
        cyl('rod', 0.036, 0.66, (-0.2, 0, 0), rot=(0, 90, 0), mat=wood, r_top=0.014, segs=12, bevel=0.0)
        for x in (0.05, 0.25, 0.42):
            cyl('guide', 0.03, 0.02, (x, 0, 0), rot=(0, 90, 0), mat=flat('#C3CCD8', 0.3, 0.7), segs=10, origin='center')
        reel = cyl('reel', 0.11, 0.07, (-0.32, -0.08, 0), rot=(90, 0, 0), mat=flat('#D9483B', 0.4, 0.2), segs=24,
                   origin='center', bevel=0.012, cap_mat=flat('#E8E4DC', 0.4))
        cyl('reelhub', 0.035, 0.09, (-0.32, -0.08, 0), rot=(90, 0, 0), mat=flat('#F2C14E', 0.3, 0.6), segs=12,
            origin='center')
        box('reelarm', (0.03, 0.06, 0.12), (-0.32, -0.13, 0.05), mat=flat('#3D424C', 0.4, 0.6), bevel=0.0)
        del reel
        L.smooth_tube('line', [(0.46, 0, 0.0), (0.5, -0.12, 0.0), (0.44, -0.22, 0.0)], 0.007, flat('#F4F7FB', 0.5))
        sphere('bob_r', 0.06, (0.42, -0.27, 0.02), flat('#E8433A', 0.3), segs=16, rings=10)
        sphere('bob_w', 0.055, (0.42, -0.27, -0.02), flat('#FFFFFF', 0.3), segs=16, rings=10)
    _ground_item(c.objs, TOOL_TILT, TOOL_SPIN)


@bld('item_bow', 'item', 'bld_items', item={'thickness': 0.15}, samples=64,
     notes='Hunting bow (tool item): curved wooden stave with a leather grip, string and one red-fletched arrow.')
def b_item_bow():
    with L.Collect() as c:
        stave = flat('#B5763F', 0.55)
        mb = L.MB()
        n = 16
        pts = []
        for k in range(n + 1):
            t = -1 + 2 * k / n
            pts.append(Vector((0.42 * t, -0.2 * (1 - t * t) + 0.04 * t ** 4, 0.0)))
        for k in range(n):
            tt = abs(-1 + 2 * (k + 0.5) / n)
            mb.seg(pts[k], pts[k + 1], 0.035 - 0.015 * tt, stave, segs=10, r2=0.035 - 0.015 * min(1.0, tt + 1.0 / n))
        mb.done('stave')
        cyl('grip', 0.042, 0.16, (0.0, -0.2, 0.0), rot=(0, 90, 0), mat=flat('#6B4226', 0.7), segs=12, origin='center')
        for x in (-0.42, 0.42):
            sphere('nock', 0.03, (x, 0.04, 0.0), flat('#8A5A33', 0.6), segs=10, rings=6)
        L.tube('string', [(-0.42, 0.04, 0.0), (0.42, 0.04, 0.0)], 0.008, flat('#F4F1EA', 0.6))
        cyl('arrow', 0.018, 0.78, (-0.38, -0.07, 0.04), rot=(0, 90, 8), mat=flat('#C98F55', 0.6), segs=8)
        cyl('ahead', 0.04, 0.11, (0.4, -0.015, 0.04), rot=(0, 90, 8), mat=flat('#7D8794', 0.35, 0.6), r_top=0.0,
            segs=10)
        for s in (-1, 1):
            f = extrude('fletch', [(0.0, 0.0), (0.14, 0.0), (0.12, 0.05 * s), (0.02, 0.06 * s)][::s], 0.01,
                        top=flat('#E8433A', 0.6), side=flat('#E8433A', 0.6), bevel=0.0)
            f.location = (-0.38, -0.07, 0.04)
            f.rotation_euler = Euler((0, 0, math.radians(8)), 'XYZ')
    _ground_item(c.objs, TOOL_TILT, TOOL_SPIN)


@bld('item_toolbox', 'item', 'bld_items', item={'thickness': 0.25}, samples=64,
     notes='Toolbox (generic tool crate): red metal box with a steel carry handle, latches and a hammer + saw handle '
           'poking out.')
def b_item_toolbox():
    with L.Collect() as c:
        red = flat('#D9483B', 0.45, 0.15)
        steel = flat('#C3CCD8', 0.3, 0.7)
        box('tbox', (0.62, 0.34, 0.2), (0, 0, 0), mat=red, bevel=0.035)
        box('tlid', (0.64, 0.36, 0.05), (0, 0, 0.2), mat=flat('#C23E33', 0.45, 0.15), bevel=0.02)
        for x in (-0.18, 0.18):
            box('latch', (0.07, 0.02, 0.07), (x, -0.18, 0.15), mat=steel, bevel=0.01)
            box('hpost', (0.03, 0.03, 0.1), (x, 0, 0.25), mat=steel, bevel=0.005)
        cyl('handle', 0.022, 0.4, (0, 0, 0.36), rot=(0, 90, 0), mat=flat('#2B2F3A', 0.5), segs=10, origin='center')
        box('hammerh', (0.05, 0.05, 0.3), (0.2, 0.08, 0.15), rot=(0, 28, 0), mat=flat('#C98F55', 0.6), bevel=0.01)
        box('hammerhead', (0.15, 0.06, 0.07), (0.28, 0.08, 0.42), rot=(0, 28, 0), mat=flat('#5A606B', 0.4, 0.6),
            bevel=0.015)
        box('saw', (0.04, 0.03, 0.16), (-0.22, 0.06, 0.2), rot=(0, -20, 0), mat=flat('#E8C25A', 0.5), bevel=0.01)
    _ground_item(c.objs, 0.0)
