"""
veh_lib.py - modelling helpers for the v5 vehicles (docs/CONTRACT_V5.md section L): toy-like, round, chunky
vehicles from the same world as the village props and the neighbour town (same palette, camera, light, PPU).

Everything goes through bl_common (camera / light / PPU 64) and the shared, READ-ONLY helpers of prop_lib,
prop_assets, bld_assets, town_lib, char_geo / char_build (people) and vil_pets / vil_anim (sled dogs).  Nothing
in those modules is modified.

Local frame of every vehicle (like a character):
  * 1 unit = 1 m, world origin = ground point under the centre of the vehicle footprint = sprite anchor.
  * the vehicle's FRONT is local -Y (it drives toward -Y), its RIGHT side is local -X.  In both rendered headings
    (SE = world +X and NE = world +Y) the camera sees the RIGHT side, so doors, the driver seat and the badge live
    there; the left side is never seen straight on.
  * VB.root is rotated per heading (bl_common.yaw_for_dir); VB.body (child of root) carries everything that bobs
    on the suspension; wheels hang directly under root and only spin.

Passenger windows (see veh_render): window panes are single-sided planes whose normal points OUT of the cabin:
from outside they are clear (you look into the cabin), from inside (the far side seen through a near window)
they are a frosted pale-blue sheet, so nothing is see-through.  Seats carry a seated-person PROXY volume that is
never rendered in the colour pass; veh_render uses it to render the occlusion masks from which veh_pack cuts the
`over_*` overlay frames (vehicle parts in front of a seated passenger).

Not run directly - see veh_models.py / veh_render.py.
"""
import math

import bpy  # noqa: F401  (import before mathutils when bpy is a module)
from mathutils import Vector, Euler, Matrix

import bl_common as bc
import prop_lib as L
from prop_lib import C, flat, box, cyl, sphere, blob, extrude, hexmix
import prop_assets as PA
import bld_assets as BA
import char_geo as G

PX_Z = 1.0 / (bc.PPU * bc.VERTICAL_SCALE)     # metres of height per screen pixel (exact 1 px bob)
INK = '#2B2F3A'
CHROME = '#D9DFE6'
RUBBER = '#2E323C'
GLOW = '#FFE2A0'
FROST = '#CFE2F2'


# =========================================================================== materials

_PAINT = {}


def paint(col, rough=0.32, coat=0.55, name=None):
    """Glossy toy-plastic paint (albedo compensated like prop_lib.flat, + a clear coat)."""
    key = (col, rough, coat)
    if key in _PAINT and _PAINT[key].name in bpy.data.materials:
        return _PAINT[key]
    c = L.adj(col)
    m = bc.mat(name or ('paint_' + c.lstrip('#') + '_%g' % rough), c, rough=rough)
    p = m.node_tree.nodes.get('Principled BSDF')
    for nm, v in (('Coat Weight', coat), ('Coat Roughness', 0.18)):
        if nm in p.inputs:
            p.inputs[nm].default_value = v
    _PAINT[key] = m
    return m


def chrome():
    return flat(CHROME, 0.22, 0.85)


def rubber():
    return flat(RUBBER, 0.62)


def glow(name, col=GLOW, strength=2.6):
    return L.emissive(name, col, col, strength)


def pane_mat(name, frost=FROST, mask=False):
    """Window pane: clear from the front (outside), frosted pale blue from behind (seen from inside the cabin).
    mask=True -> the occlusion-pass variant: clear from the front, HOLDOUT from behind."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    geo = nt.nodes.new('ShaderNodeNewGeometry')
    mix = nt.nodes.new('ShaderNodeMixShader')
    tr = nt.nodes.new('ShaderNodeBsdfTransparent')
    if mask:
        back = nt.nodes.new('ShaderNodeHoldout')
    else:
        back = nt.nodes.new('ShaderNodeBsdfPrincipled')
        back.inputs['Base Color'].default_value = (*bc.srgb_to_linear(L.adj(frost)), 1.0)
        back.inputs['Roughness'].default_value = 0.35
        back.inputs['Emission Color'].default_value = (*bc.srgb_to_linear(frost), 1.0)
        back.inputs['Emission Strength'].default_value = 0.35
    nt.links.new(geo.outputs['Backfacing'], mix.inputs['Fac'])
    nt.links.new(tr.outputs[0], mix.inputs[1])
    nt.links.new(back.outputs[0], mix.inputs[2])
    nt.links.new(mix.outputs[0], out.inputs['Surface'])
    try:
        m.blend_method = 'HASHED'
    except Exception:
        pass
    return m


def mask_emit():
    m = bpy.data.materials.get('veh_mask_emit')
    if m:
        return m
    m = bpy.data.materials.new('veh_mask_emit')
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    em = nt.nodes.new('ShaderNodeEmission')
    em.inputs['Color'].default_value = (1, 1, 1, 1)
    em.inputs['Strength'].default_value = 1.0
    nt.links.new(em.outputs[0], out.inputs['Surface'])
    return m


# =========================================================================== primitives

def rbox(name, size, loc, mat, r=0.1, segs=4, rot=(0, 0, 0), origin='bottom', taper=None, top_mat=None):
    """Rounded (toy) box: a bevelled box with a big bevel radius."""
    return box(name, size, loc, rot=rot, mat=mat, bevel=r, segs=segs, origin=origin, taper=taper, top_mat=top_mat)


def rounded_pts(w, h, r, n=6, cx=0.0, cy=0.0, rs=None):
    """Rounded rectangle outline (CCW).  rs = per-corner radii (tr, tl, bl, br)."""
    rs = rs or (r, r, r, r)
    pts = []
    corners = ((1, 1, 0.0, rs[0]), (-1, 1, math.pi / 2, rs[1]), (-1, -1, math.pi, rs[2]),
               (1, -1, 1.5 * math.pi, rs[3]))
    for sx, sy, a0, rr in corners:
        ccx, ccy = cx + sx * (w / 2 - rr), cy + sy * (h / 2 - rr)
        if rr <= 1e-4:
            pts.append((cx + sx * w / 2, cy + sy * h / 2))
            continue
        for k in range(n + 1):
            a = a0 + (math.pi / 2) * k / n
            pts.append((ccx + rr * math.cos(a), ccy + rr * math.sin(a)))
    return pts


def profile_x(name, pts_yz, width, mat, bevel=0.06, segs=3, x=0.0, top=None):
    """Extrude a side profile drawn in the (y, z) plane across the vehicle width (along X), centred on x."""
    o = extrude(name, pts_yz, width, rot=(90, 0, 90), top=top or mat, side=mat, bevel=bevel, segs=segs, angle=40)
    o.location.x = x - width / 2
    return o


def disc_x(name, r, t, loc, mat, segs=28, bevel=0.01):
    """Disc / short cylinder whose axis is X (wheel hubs, round lamps on a side)."""
    return cyl(name, r, t, loc, rot=(0, 90, 0), mat=mat, segs=segs, origin='center', bevel=bevel)


def disc_y(name, r, t, loc, mat, segs=28, bevel=0.01, r_top=None):
    """Disc whose axis is Y (head / tail lamps, round grilles facing front or back)."""
    return cyl(name, r, t, loc, rot=(90, 0, 0), mat=mat, segs=segs, origin='center', bevel=bevel, r_top=r_top)


def rod(name, p, q, r, mat, segs=8):
    mb = L.MB()
    mb.seg(Vector(p), Vector(q), r, mat, segs=segs)
    return mb.done(name)


def rail_path(name, pts, r, mat, segs=8):
    mb = L.MB()
    for a, b in zip(pts, pts[1:]):
        mb.seg(Vector(a), Vector(b), r, mat, segs=segs)
    return mb.done(name)


def snow_cap(name, sx, sy, loc, t=0.07, seed=0):
    """Soft oval snow mound (sx x sy m) sitting on a roof at loc (z = roof top)."""
    r = min(sx, sy) / 2.0
    return PA.snow_cap(name, r, loc, h=t * 1.5, seed=seed, scale=(sx / (2 * r), sy / (2 * r), 1.0))


# =========================================================================== the builder

class VB:
    """Vehicle build context: root (heading), body (bobbing), wheels, seats + proxies, panes, points, blinkers."""

    def __init__(self, key):
        self.key = key
        self.root = G.empty('veh_root', None, (0, 0, 0))
        self.root.rotation_mode = 'XYZ'
        self.body = G.empty('veh_body', self.root, (0, 0, 0))
        self.body.rotation_mode = 'XYZ'
        self.wheels = []          # (group empty, radius)
        self.wheel_sym = 3        # hub pattern symmetry (holes / spokes)
        self.wheel_turns = 1      # symmetry periods per move loop -> spin per loop = turns * 360 / sym
        self.panes = []
        self.pane_mat = pane_mat('pane_' + key)
        self.pane_mask = pane_mat('panemask_' + key, mask=True)
        self.seats = []           # dict(loc, facing, name)
        self.proxies = []
        self.points = {}          # field -> Vector or [Vector] (body-local)
        self.blinkers = []        # (material, colour_on, strength_on, phase list per frame-mode)
        self.smokes = []          # L.Smoke objects (hidden in idle unless told)
        self.hooks = []           # fn(anim, i, n) extra posing (animals, crew, wipers ...)
        self.mask_hidden = []     # objects hidden in the occlusion passes (smoke, snow spray)
        self.rigs = []
        self.length = 0.0
        self.width = 0.0
        self.height = 0.0
        self.bob = {}             # anim -> list of integer px per frame (body lift)
        self.lights_on = True

    # ---- parenting
    def adopt(self, objs):
        """Parent the top-level objects of a Collect block to the body."""
        for o in BA.top_level(objs):
            if o.parent is None and o is not self.root and o is not self.body:
                o.parent = self.body
        return objs

    # ---- wheels
    def add_wheel(self, loc, r, w=0.26, hub='#F4F1EA', tyre=RUBBER, holes=3, hole_col=None, cap=CHROME,
                  spokes=None, rim=None, name='wheel'):
        g = wheel(name, r, w, hub=hub, tyre=tyre, holes=holes, hole_col=hole_col, cap=cap, spokes=spokes, rim=rim)
        g.parent = self.root
        g.location = loc
        g.rotation_mode = 'XYZ'
        self.wheels.append((g, r))
        return g

    def spin(self, ang):
        for g, r in self.wheels:
            g.rotation_euler = Euler((ang, 0.0, 0.0), 'XYZ')

    # ---- panes
    def pane(self, name, corners):
        """Window pane from 4 corners (body-local, CCW seen from OUTSIDE so the normal points out)."""
        import bmesh
        bm = bmesh.new()
        vs = [bm.verts.new(Vector(c)) for c in corners]
        bm.faces.new(vs)
        bm.normal_update()
        me = bpy.data.meshes.new(name)
        bm.to_mesh(me)
        bm.free()
        me.materials.append(self.pane_mat)
        o = bpy.data.objects.new(name, me)
        bpy.context.scene.collection.objects.link(o)
        o.parent = self.body
        o.visible_shadow = False
        self.panes.append(o)
        return o

    def side_window(self, name, x, y0, y1, z0, z1, side=-1, inset=0.0, glint=True):
        """Pane on the side wall plane x (side=-1 right side, normal -X; +1 left side, normal +X)."""
        if side < 0:
            c = [(x - inset, y1, z0), (x - inset, y0, z0), (x - inset, y0, z1), (x - inset, y1, z1)]
        else:
            c = [(x + inset, y0, z0), (x + inset, y1, z0), (x + inset, y1, z1), (x + inset, y0, z1)]
        o = self.pane(name, c)
        if glint and side < 0:
            self.glint(name + '_gl', Vector((x - 0.012, y0 + (y1 - y0) * 0.2, z0 + (z1 - z0) * 0.62)),
                       Vector((0, 1, 0)), (y1 - y0) * 0.22, (z1 - z0) * 0.4, normal=Vector((-1, 0, 0)))
        return o

    def end_window(self, name, y, x0, x1, z0, z1, end=-1, glint=True):
        """Pane on the front (end=-1, normal -Y) or back (end=+1, normal +Y) plane y."""
        if end < 0:
            c = [(x0, y, z0), (x1, y, z0), (x1, y, z1), (x0, y, z1)]
        else:
            c = [(x1, y, z0), (x0, y, z0), (x0, y, z1), (x1, y, z1)]
        o = self.pane(name, c)
        if glint:
            self.glint(name + '_gl', Vector((x0 + (x1 - x0) * 0.25, y + 0.012 * end, z0 + (z1 - z0) * 0.6)),
                       Vector((1, 0, 0)), (x1 - x0) * 0.16, (z1 - z0) * 0.42, normal=Vector((0, end, 0)))
        return o

    def glint(self, name, c, along, w, h, normal):
        """Two slanted white streaks on a pane (an opaque 'reflection' that reads as glass)."""
        mat = L.emissive(name + '_m', '#EEF6FC', '#EEF6FC', 0.35)
        up = Vector((0, 0, 1))
        objs = []
        w, h = w * 0.4, h * 0.55
        c = c + up * h * 0.5 - along * w * 0.8
        for k, (off, ww) in enumerate(((0.0, w), (w * 1.7, w * 0.45))):
            p = c + along * off
            # parallelogram slanted by 30 deg
            a = p - along * ww / 2 - up * h / 2
            b = p + along * ww / 2 - up * h / 2
            d = p - along * ww / 2 + up * h / 2 + along * h * 0.55
            e = p + along * ww / 2 + up * h / 2 + along * h * 0.55
            import bmesh
            bm = bmesh.new()
            vs = [bm.verts.new(v) for v in (a, b, e, d)]
            f = bm.faces.new(vs)
            bm.normal_update()
            if f.normal.dot(normal) < 0:
                f.normal_flip()
            me = bpy.data.meshes.new(name)
            bm.to_mesh(me)
            bm.free()
            me.materials.append(mat)
            o = bpy.data.objects.new('%s%d' % (name, k), me)
            bpy.context.scene.collection.objects.link(o)
            o.parent = self.body
            o.visible_shadow = False
            objs.append(o)
        return objs

    # ---- seats
    def seat(self, front, facing=(0, -1, 0), name='seat', proxy=True, cushion=None, back_h=0.55, w=0.62,
             build=True, ceiling=None):
        """A seat whose surface FRONT-CENTRE is `front` (body-local) and whose sitter faces `facing`.
        Convention = villagers `sit` / life_props seatPoints: the sitting character's anchor is the front-centre
        of the seat surface (hips 0.12 m behind it, 0.065 m above)."""
        f = Vector(facing).normalized()
        P = Vector(front)
        if build and cushion:
            yaw = math.degrees(math.atan2(f.x, -f.y))
            cm = cushion if not isinstance(cushion, str) else paint(cushion, 0.6, coat=0.2)
            s = rbox(name + '_c', (w, 0.44, 0.14), (0, 0.22, -0.14), cm, r=0.06, origin='bottom')
            b = rbox(name + '_b', (w, 0.13, back_h), (0, 0.44, -0.1), cm, r=0.06, origin='bottom')
            gobj = L.group([s, b], name, loc=tuple(P), rot=(0, 0, yaw))
            gobj.parent = self.body
        self.seats.append({'loc': P, 'facing': f, 'name': name})
        if proxy:
            # the proxy must stay INSIDE the cabin (below the roof's inner surface), else the part poking through
            # the roof counts as 'visible' and the passenger's head would be drawn over the roof
            h = 1.85 if ceiling is None else min(1.85, ceiling - (P.z - 0.55))
            self.proxy(P, f, name + '_px', h=h)
        return P

    def proxy(self, P, f, name, w=0.8, d=0.9, h=1.85, below=0.55):
        """Seated-person volume (generous: a chibi head is 0.6 m wide, ~1.2 m above the seat)."""
        back = -f
        c = P + back * 0.14 + Vector((0, 0, h / 2 - below))
        yaw = math.degrees(math.atan2(f.x, -f.y))
        o = box(name, (w, d, h), tuple(c), rot=(0, 0, yaw), mat=mask_emit(), bevel=0.22, segs=3, origin='center')
        o.parent = self.body
        o.hide_render = True
        o.visible_shadow = False
        for attr in ('visible_diffuse', 'visible_glossy', 'visible_transmission', 'visible_volume_scatter'):
            try:
                setattr(o, attr, False)
            except Exception:
                pass
        self.proxies.append(o)
        return o

    # ---- points
    def point(self, field, p, many=False):
        if many:
            self.points.setdefault(field, []).append(Vector(p))
        else:
            self.points[field] = Vector(p)

    # ---- blinking lights
    def blinker(self, name, loc, col, r=0.09, phase=0, shape='dome', parent=None, strength=4.0, off='#6B5A5A'):
        """Emergency beacon: an emissive dome that is ON in frames where (i + phase) is even (move / siren)."""
        m = L.emissive(name + '_m', off, col, 0.0)
        if shape == 'dome':
            o = sphere(name, r, loc, m, scale=(1, 1, 0.85), segs=18, rings=10)
        else:
            o = rbox(name, (r * 2.4, r * 1.6, r * 1.3), loc, m, r=r * 0.45, origin='center')
        o.parent = parent or self.body
        self.blinkers.append({'mat': m, 'col': col, 'off': off, 'phase': phase, 'strength': strength})
        return o

    def set_blink(self, on_mode, i):
        for b in self.blinkers:
            p = b['mat'].node_tree.nodes.get('Principled BSDF')
            lit = on_mode and ((i + b['phase']) % 2 == 0)
            col = b['col'] if lit else b['off']
            p.inputs['Base Color'].default_value = (*bc.srgb_to_linear(L.adj(col)), 1.0)
            p.inputs['Emission Color'].default_value = (*bc.srgb_to_linear(b['col']), 1.0)
            p.inputs['Emission Strength'].default_value = b['strength'] if lit else 0.0

    # ---- smoke / steam
    def smoke(self, name, base, **kw):
        s = L.Smoke(name, base, **kw)
        for o in s.obs:
            o.parent = self.body
        self.smokes.append(s)
        self.mask_hidden.extend(s.obs)
        return s


# =========================================================================== wheels, lamps, bumpers

def wheel(name, r, w=0.26, hub='#F4F1EA', tyre=RUBBER, holes=3, hole_col=None, cap=CHROME, spokes=None,
          rim=None):
    """Toy wheel (axle = local X, centred at the origin): a fat rounded tyre, a coloured hub disc with `holes`
    dark holes (or `spokes` wooden spokes for era-2 wheels) and a chrome cap, so a spin step reads as rolling."""
    tm = flat(tyre, 0.62) if isinstance(tyre, str) else tyre
    hm = paint(hub, 0.35) if isinstance(hub, str) else hub
    objs = [cyl(name + '_t', r, w, (0, 0, 0), rot=(0, 90, 0), mat=tm, segs=36, origin='center',
                bevel=min(w * 0.45, r * 0.3), bsegs=4)]
    if spokes:
        rimm = flat(rim or hub, 0.5)
        objs.append(cyl(name + '_rim', r * 0.84, w + 0.01, (0, 0, 0), rot=(0, 90, 0), mat=rimm, segs=32,
                        origin='center', bevel=0.01))
        objs.append(cyl(name + '_in', r * 0.7, w - 0.02, (0, 0, 0), rot=(0, 90, 0), mat=flat('#3A2E28', 0.8),
                        segs=32, origin='center', bevel=0.0))
        sm = paint(hole_col or '#C98F55', 0.5)
        for k in range(spokes):
            a = math.tau * k / spokes
            objs.append(box(name + '_sp', (w + 0.03, 0.07, r * 1.42), (0, 0, 0), rot=(math.degrees(a), 0, 0),
                            mat=sm, bevel=0.015, origin='center'))
        objs.append(cyl(name + '_hub', r * 0.24, w + 0.06, (0, 0, 0), rot=(0, 90, 0), mat=hm, segs=18,
                        origin='center', bevel=0.02))
        objs.append(cyl(name + '_cap', r * 0.11, w + 0.09, (0, 0, 0), rot=(0, 90, 0), mat=flat(cap, 0.25, 0.85),
                        segs=12, origin='center', bevel=0.01))
    else:
        objs.append(cyl(name + '_h', r * 0.62, w + 0.02, (0, 0, 0), rot=(0, 90, 0), mat=hm, segs=32,
                        origin='center', bevel=0.02))
        hc = flat(hole_col or hexmix(hub if isinstance(hub, str) else '#F4F1EA', '#2B2F3A', 0.55), 0.5)
        for k in range(holes):
            a = math.tau * k / holes
            objs.append(cyl(name + '_o', r * 0.12, w + 0.035, (0, r * 0.36 * math.cos(a), r * 0.36 * math.sin(a)),
                            rot=(0, 90, 0), mat=hc, segs=14, origin='center', bevel=0.005))
        objs.append(cyl(name + '_c', r * 0.17, w + 0.06, (0, 0, 0), rot=(0, 90, 0), mat=flat(cap, 0.22, 0.85),
                        segs=16, origin='center', bevel=0.015))
    return L.group(objs, name)


def headlamp(name, loc, r=0.13, facing=-1, lens=GLOW, ring=CHROME, strength=2.4, depth=0.08):
    """Round headlamp on a front (facing=-1) or back (+1) face: chrome bezel + glowing lens."""
    x, y, z = loc
    objs = [disc_y(name + '_b', r, depth, (x, y, z), flat(ring, 0.22, 0.85), segs=28, bevel=0.02),
            sphere(name + '_l', r * 0.82, (x, y + facing * depth * 0.45, z), glow(name + '_g', lens, strength),
                   scale=(1, 0.45, 1), segs=20, rings=10)]
    return objs


def taillamp(name, loc, r=0.08, facing=1, col='#E8433A', strength=1.6):
    x, y, z = loc
    return [disc_y(name + '_b', r * 1.2, 0.05, (x, y, z), chrome(), segs=20, bevel=0.01),
            sphere(name + '_l', r, (x, y + facing * 0.03, z), L.emissive(name + '_g', col, col, strength),
                   scale=(1, 0.5, 1), segs=16, rings=8)]


def bumper(name, y, width, z, mat=None, t=0.14, h=0.13):
    return rbox(name, (width, t, h), (0, y, z), mat or chrome(), r=min(t, h) * 0.45, origin='center')


def mirror_arm(name, base, out=-1, col=CHROME):
    x, y, z = base
    m = flat(col, 0.25, 0.85)
    return [rod(name + '_a', (x, y, z), (x + out * 0.16, y - 0.02, z + 0.1), 0.018, m),
            rbox(name + '_h', (0.06, 0.12, 0.16), (x + out * 0.18, y - 0.02, z + 0.1), m, r=0.03, origin='center')]


# =========================================================================== people

def crew(key, seat_front, body_parent, spec_over=None, dress=None):
    """A seated character rig (char_build bodies, same as assets/characters) whose root = seat front-centre."""
    import bld_boats as BB
    rig = BB.crew_rig(key, spec_over=spec_over, dress=dress)
    rig.j['root'].parent = body_parent
    rig.rest_loc['root'] = Vector(seat_front)
    return rig


SIT = {'hips@': (0, 0.12, 0.065 - 0.338), 'hip_R': (84, 4, 0), 'hip_L': (84, 4, 0),
       'knee_R': (74, 0, 0), 'knee_L': (74, 0, 0)}


def pose_driver(rig, wheel_world, anim, i, n, wave=False, yaw=0.0, face=None):
    """Seated driver: hands on the steering wheel rim (IK), gentle bob; wave = idle greeting."""
    a = math.tau * i / max(n, 1)
    p = dict(SIT)
    p['spine'] = (-4, 0, 0)
    p['head'] = (-2 + 2 * math.sin(a), 0, (14 * math.sin(a) if anim == 'idle' and not wave else 0))
    p['_show'] = {face or ('face_happy' if (wave and i % 2 == 1) else 'face_smile')}
    rig.apply(p, yaw_deg=yaw)
    bpy.context.view_layer.update()
    inv = rig.j['chest'].matrix_world.inverted()
    wc = Vector(wheel_world)
    for side, dx in (('R', -0.13), ('L', 0.13)):
        if wave and side == 'R':
            up = Vector((-0.22, -0.12, 0.42 + (0.05 if i % 2 else -0.02)))
            rig.solve_arm('R', tuple(up), (-1.0, 0.2, -0.4))
            continue
        tgt = inv @ (wc + Vector((dx, 0.0, 0.02)))
        rig.solve_arm(side, tuple(tgt), (0.8 * (-1 if side == 'R' else 1), 0.4, -0.6))
    bpy.context.view_layer.update()


# =========================================================================== horses

def build_horse(name, coat='#B8713E', mane='#F3E6CC', muzzle='#F1D9BC', socks='#F4F1EA', blaze=True,
                blanket='#C8463D', trim='#F2C14E', scale=1.0, collar='#B23A30'):
    """A chunky toy draft horse (front = -Y, ground at z = 0): barrel body, big friendly head with shiny eyes,
    fluffy white feathered hooves, a collar with gold bells and a little blanket.  Returns a char_geo.Rig whose
    joints are root, body, neck, head, ear_R/L, tail, leg_XX / knee_XX (XX = FR, FL, BR, BL)."""
    s = scale
    rig = G.Rig('horse')
    rig.add('root', None, (0, 0, 0))
    rig.add('body', 'root', (0, 0, 0.98 * s))
    cm = bc.mat(name + '_coat', coat, rough=0.62)
    mm = bc.mat(name + '_mane', mane, rough=0.8)
    zm = bc.mat(name + '_muz', muzzle, rough=0.7)
    fm = bc.mat(name + '_sock', socks, rough=0.9)
    hoof = bc.mat(name + '_hoof', '#3A2E2A', rough=0.5)
    body = rig.j['body']
    G.mesh_obj(name + '_barrel', G.bm_ellipsoid(0.36 * s, 0.62 * s, 0.36 * s, 32, 16), cm, body)
    G.mesh_obj(name + '_chest', G.bm_ellipsoid(0.34 * s, 0.3 * s, 0.36 * s, 24, 12), cm, body,
               loc=(0, -0.42 * s, 0.04 * s))
    G.mesh_obj(name + '_rump', G.bm_ellipsoid(0.355 * s, 0.32 * s, 0.35 * s, 24, 12), cm, body,
               loc=(0, 0.42 * s, 0.05 * s))
    # neck + head
    rig.add('neck', 'body', (0, -0.5 * s, 0.16 * s))
    neck_pts = [(0, 0, -0.05 * s), (0, -0.08 * s, 0.22 * s), (0, -0.16 * s, 0.44 * s), (0, -0.22 * s, 0.56 * s)]
    G.mesh_obj(name + '_neck', G.bm_tube_path(neck_pts, lambda t: (0.25 - 0.09 * t) * s, segr=20, flat=0.82),
               cm, rig.j['neck'])
    rig.add('head', 'neck', (0, -0.24 * s, 0.6 * s))
    head = rig.j['head']
    hq = Euler((math.radians(-38), 0, 0)).to_quaternion()
    G.mesh_obj(name + '_skull', G.bm_ellipsoid(0.185 * s, 0.25 * s, 0.2 * s, 28, 14), cm, head,
               loc=(0, -0.06 * s, 0.02 * s), rot=hq)
    G.mesh_obj(name + '_snout', G.bm_ellipsoid(0.15 * s, 0.16 * s, 0.15 * s, 24, 12), zm, head,
               loc=(0, -0.24 * s, -0.12 * s), rot=hq)
    for sx in (-1, 1):
        G.mesh_obj(name + '_nos', G.bm_ellipsoid(0.026 * s, 0.02 * s, 0.03 * s, 10, 6),
                   bc.mat('nostril', '#6B4A3E', rough=0.6), head, loc=(sx * 0.06 * s, -0.37 * s, -0.12 * s))
        # big shiny toy eyes on the front-sides
        ex, ey, ez = sx * 0.15 * s, -0.12 * s, 0.07 * s
        G.mesh_obj(name + '_eye', G.bm_ellipsoid(0.045 * s, 0.04 * s, 0.055 * s, 14, 8),
                   bc.mat('eye', '#2A2026', rough=0.22), head, loc=(ex, ey, ez))
        G.mesh_obj(name + '_eyehi', G.bm_ellipsoid(0.016 * s, 0.012 * s, 0.018 * s, 8, 6),
                   bc.mat('eye_hi', '#FFFFFF', rough=0.3, emission='#FFFFFF', emission_strength=1.5), head,
                   loc=(ex + sx * 0.012 * s, ey - 0.03 * s, ez + 0.022 * s))
        G.mesh_obj(name + '_blush', G.bm_ellipsoid(0.03 * s, 0.012 * s, 0.022 * s, 10, 6),
                   bc.mat('blush', '#F49A9A', rough=0.9), head, loc=(sx * 0.15 * s, -0.2 * s, -0.04 * s))
    if blaze:
        G.mesh_obj(name + '_blaze', G.bm_ellipsoid(0.045 * s, 0.03 * s, 0.17 * s, 12, 8), fm, head,
                   loc=(0, -0.2 * s, 0.03 * s), rot=Euler((math.radians(-40), 0, 0)).to_quaternion())
    # ears
    for side, sx in (('R', -1), ('L', 1)):
        rig.add('ear_' + side, 'head', (sx * 0.1 * s, 0.04 * s, 0.17 * s), side=1 if side == 'R' else -1)
        cone = G.bm_lathe([(0.0, 0.0), (0.05 * s, 0.01 * s), (0.04 * s, 0.08 * s), (0.0, 0.15 * s)], seg=12,
                          sy=0.55, smooth_n=8)
        G.mesh_obj(name + '_ear', cone, cm, rig.j['ear_' + side],
                   rot=Euler((math.radians(-8), math.radians(sx * 14), 0)).to_quaternion())
    # mane (a row of soft tufts along the top of the neck) + forelock
    for k in range(6):
        t = k / 5.0
        p = Vector(neck_pts[0]).lerp(Vector(neck_pts[-1]), t) + Vector((0, 0.15 * s - 0.04 * s * t, 0.06 * s))
        G.mesh_obj(name + '_mane', G.bm_ellipsoid(0.07 * s, 0.11 * s, 0.1 * s, 12, 8), mm, rig.j['neck'],
                   loc=tuple(p), rot=Euler((math.radians(-30 + 10 * k), 0, 0)).to_quaternion())
    G.mesh_obj(name + '_forelock', G.bm_ellipsoid(0.08 * s, 0.06 * s, 0.09 * s, 12, 8), mm, head,
               loc=(0, -0.04 * s, 0.2 * s))
    # tail
    rig.add('tail', 'body', (0, 0.66 * s, 0.14 * s))
    tpts = [(0, 0, 0), (0, 0.12 * s, -0.05 * s), (0, 0.2 * s, -0.25 * s), (0, 0.22 * s, -0.5 * s)]
    G.mesh_obj(name + '_tail', G.bm_tube_path(tpts, lambda t: (0.07 + 0.08 * math.sin(math.pi * t * 0.8)) * s,
                                              segr=14), mm, rig.j['tail'])
    G.mesh_obj(name + '_tailtip', G.bm_ellipsoid(0.1 * s, 0.09 * s, 0.13 * s, 12, 8), mm, rig.j['tail'],
               loc=(0, 0.22 * s, -0.5 * s))
    # legs: chunky upper + lower, fluffy white feathering, dark hooves
    for leg, (lx, ly) in {'FR': (-0.19, -0.42), 'FL': (0.19, -0.42), 'BR': (-0.19, 0.44), 'BL': (0.19, 0.44)}.items():
        rig.add('leg_' + leg, 'body', (lx * s, ly * s, -0.16 * s), side=1 if leg[1] == 'R' else -1)
        rig.add('knee_' + leg, 'leg_' + leg, (0, 0, -0.34 * s))
        G.mesh_obj(name + '_thigh', G.bm_capsule(0.13 * s, 0.34 * s, r_end=0.1 * s), cm, rig.j['leg_' + leg])
        G.mesh_obj(name + '_shin', G.bm_capsule(0.09 * s, 0.24 * s, r_end=0.085 * s), cm, rig.j['knee_' + leg])
        G.mesh_obj(name + '_feather', G.bm_ring(0.105 * s, 0.07 * s, seg=32, segr=10, tufts=8, bump=0.45,
                                                seed=3.0 + lx), fm, rig.j['knee_' + leg], loc=(0, 0, -0.3 * s))
        G.mesh_obj(name + '_hoofc', G.bm_lathe([(0.0, 0.0), (0.11 * s, 0.0), (0.105 * s, 0.07 * s),
                                                (0.085 * s, 0.1 * s), (0.0, 0.1 * s)], seg=20), hoof,
                   rig.j['knee_' + leg], loc=(0, -0.01 * s, -0.48 * s))
    # harness: collar with bells, blanket with gold trim, girth
    col_m = bc.mat(name + '_collar', collar, rough=0.5)
    gold = bc.mat('veh_gold', '#F2C14E', rough=0.25, metal=0.7)
    tilt = math.radians(24)
    cq = Euler((tilt, 0, 0)).to_quaternion()
    cc = Vector((0, -0.03 * s, 0.1 * s))
    G.mesh_obj(name + '_collar', G.bm_ring(0.25 * s, 0.075 * s, seg=40, segr=12, sx=0.86, sy=1.0), col_m,
               rig.j['neck'], loc=tuple(cc), rot=cq)
    G.mesh_obj(name + '_hames', G.bm_ring(0.3 * s, 0.026 * s, seg=40, segr=8, sx=0.84), gold, rig.j['neck'],
               loc=tuple(cc + Vector((0, -0.01 * s, 0.03 * s))), rot=cq)
    bells = []
    for k in range(5):
        u = math.radians(-90 + 26 * (k - 2))
        v = Vector((math.cos(u) * 0.86, math.sin(u) * math.cos(tilt), math.sin(u) * math.sin(tilt))) * 0.3 * s
        b = G.mesh_obj(name + '_bell', G.bm_ellipsoid(0.048 * s, 0.048 * s, 0.054 * s, 12, 8), gold, rig.j['neck'],
                       loc=tuple(cc + v + Vector((0, -0.03 * s, -0.04 * s))))
        bells.append(b)
    bl = bc.mat(name + '_blanket', blanket, rough=0.8)
    G.mesh_obj(name + '_blanket', G.bm_shell(0.39 * s, 0.42 * s, 0.385 * s, lambda x, y, z: 1.0, seg=32, rings=16,
                                             zmin=0.25), bl, body, loc=(0, -0.05 * s, 0.0))
    G.mesh_obj(name + '_trim', G.bm_ring(0.378 * s, 0.024 * s, seg=40, segr=8, sx=1.0, sy=1.08), gold, body,
               loc=(0, -0.05 * s, 0.096 * s))
    G.mesh_obj(name + '_girth', G.bm_ring(0.372 * s, 0.032 * s, seg=40, segr=8), col_m, body,
               loc=(0, -0.24 * s, 0.0), rot=Euler((math.radians(90), 0, 0)).to_quaternion())
    rig.meta['bells'] = bells
    rig.meta['scale'] = s
    return rig


def pose_horse(rig, anim, i, n, phase=0.0, yaw=0.0):
    """idle = breathing + ear flick + tail swish; move = trot (diagonal pairs), body bounce, head nod."""
    a = math.tau * i / n + phase
    sn, cs = math.sin(a), math.cos(a)
    p = {}
    if anim == 'idle':
        p['body@'] = (0, 0, 0.006 * sn)
        p['neck'] = (3 * sn, 0, 0)
        p['head'] = (4 * cs, 0, 4 * sn)
        p['tail'] = (0, 0, 16 * sn)
        p['ear_R'] = (0, 0, -18 if i % 4 == 2 else 0)
        p['ear_L'] = (0, 0, 10 * sn)
        for leg in ('FR', 'FL', 'BR', 'BL'):
            p['leg_' + leg] = (0, 0, 0)
        p['leg_BL'] = (-4, 0, 0)
        p['knee_BL'] = (-14, 0, 0)          # resting hind hoof
    else:
        for leg, ph in (('FR', 0.0), ('BL', 0.0), ('FL', math.pi), ('BR', math.pi)):
            sw = math.sin(a + ph)
            fwd = math.cos(a + ph)
            p['leg_' + leg] = (24 * sw, 0, 0)
            lift = max(0.0, fwd) ** 1.2
            if leg[0] == 'F':
                p['knee_' + leg] = (8 + 62 * lift, 0, 0)
            else:
                p['knee_' + leg] = (-(6 + 48 * lift), 0, 0)
        p['body@'] = (0, 0, 0.03 * abs(math.cos(a)) - 0.012)
        p['body'] = (1.5 * math.sin(2 * a), 0, 0)
        p['neck'] = (-5 * math.cos(2 * a), 0, 0)
        p['head'] = (4 * math.cos(2 * a), 0, 0)
        p['tail'] = (6 * cs, 0, 12 * sn)
        p['ear_R'] = (-6 * math.cos(2 * a), 0, 0)
        p['ear_L'] = (-6 * math.cos(2 * a + 0.7), 0, 0)
    rig.apply(p, yaw_deg=yaw)
    for k, b in enumerate(rig.meta.get('bells', [])):
        b.rotation_mode = 'XYZ'
        b.rotation_euler = (math.radians(14 * math.sin(a * 2 + k)), 0, 0)


# =========================================================================== sled dogs (the village dog's body, husky coat)

def build_husky(name, coat='#7F8A99', light='#F6F3EE', harness='#3D7CC9', scale=1.18):
    """The village dog (vil_pets.build_dog, unchanged) recoloured as a grey husky with a blue harness."""
    import vil_pets as VP
    before = set(bpy.data.objects)
    rig = VP.build_dog()
    new = [o for o in bpy.data.objects if o not in before]
    remap = {}
    for o in new:
        if o.type != 'MESH' or not o.data.materials:
            continue
        m = o.data.materials[0]
        if m is None:
            continue
        nm = m.name
        if nm.startswith('shiba_cream'):
            tgt = (name + '_light', light)
        elif nm.startswith('shiba'):
            tgt = (name + '_coat', coat)
        elif nm.startswith('scarf'):
            tgt = (name + '_harn', harness)
        else:
            continue
        if tgt[0] not in remap:
            remap[tgt[0]] = bc.mat(tgt[0], tgt[1], rough=0.85 if 'harn' not in tgt[0] else 0.6)
        o.data.materials[0] = remap[tgt[0]]
    top = G.empty(name + '_scale', None, (0, 0, 0))
    top.scale = (scale, scale, scale)
    rig.j['root'].parent = top
    rig.meta['top'] = top
    # harness band around the chest
    G.mesh_obj(name + '_hband', G.bm_ring(0.135, 0.022, seg=36, segr=8, sx=1.0, sy=0.95),
               bc.mat(name + '_harn', harness, rough=0.6), rig.j['body'], loc=(0, -0.08, 0.0),
               rot=Euler((math.radians(90), 0, 0)).to_quaternion())
    return rig


def pose_husky(rig, anim, i, n, phase_i=0, yaw=0.0):
    import vil_anim as VA
    if anim == 'idle':
        p = VA.pet_pose('pet_dog', 'idle', (i + phase_i) % 4, 4)
        p['_face'] = 'pet_happy' if (i + phase_i) % 4 in (1, 2) else 'pet_neutral'
    else:
        p = VA.pet_pose('pet_dog', 'run', (i + phase_i) % n, n)
    face = p.pop('_face')
    props = p.pop('_props', set())
    p['_show'] = set(VA.PET_FACES[face]) | set(props)
    if anim == 'idle':
        p['_show'] |= {'p_m_open'}
        p['_show'].discard('p_m_closed')
    rig.apply(p, yaw_deg=yaw)


# =========================================================================== misc parts

def runner(name, y0, y1, x, z, mat, curl=0.32, r=0.035):
    """Sleigh runner along Y from y0 (front, curled up) to y1 at height z (ground contact z ~ r)."""
    pts = [(x, y1, z), (x, y0 + curl * 0.6, z)]
    for k in range(1, 7):
        a = math.pi / 2 * k / 6
        pts.append((x, y0 + curl * 0.6 - math.sin(a) * curl * 0.6, z + (1 - math.cos(a)) * curl))
    pts.append((x, y0 + 0.02, z + curl * 1.25))
    return rail_path(name, pts, r, mat, segs=10)


def crate(name, size, loc, rot_z=0.0, snow=True, seed=0):
    return PA.crate_model(name, size, loc, rot=(0, 0, rot_z), snow=snow, seed=seed)


def sack(name, loc, s=1.0, col='#D8C39A', seed=0):
    return BA.sack(name, loc, s=s, col=col, seed=seed)


def barrel(name, loc, scale=0.45, seed=0):
    return PA.barrel_model(name, loc=loc, scale=scale, seed=seed)


def snowflake_badge(name, center, r=0.16, psi=-90.0, bg='#3D7CC9', fg='#F4F1EA'):
    """Round door badge with a white snowflake (the Frost Village mark), facing heading psi."""
    objs = [cyl(name + '_d', r, 0.03, (0, 0, 0), rot=(90, 0, 0), mat=paint(bg, 0.35), segs=32, origin='center',
                bevel=0.008),
            cyl(name + '_r', r * 1.12, 0.02, (0, 0.012, 0), rot=(90, 0, 0), mat=flat('#F2C14E', 0.3, 0.7), segs=32,
                origin='center', bevel=0.005)]
    wm = flat(fg, 0.4)
    for k in range(3):
        a = 60 * k
        objs.append(box(name + '_arm', (r * 1.5, 0.02, r * 0.16), (0, -0.02, 0), rot=(0, a, 0), mat=wm,
                        bevel=0.004, origin='center'))
        for sgn in (-1, 1):
            for sb in (-1, 1):
                ang = math.radians(a)
                cx, cz = math.cos(ang) * r * 0.5 * sgn, -math.sin(ang) * r * 0.5 * sgn
                objs.append(box(name + '_tw', (r * 0.32, 0.02, r * 0.1), (cx, -0.02, cz),
                                rot=(0, a + sb * 50 * sgn, 0), mat=wm, bevel=0.003, origin='center'))
    return L.group(objs, name, loc=center, rot=(0, 0, psi))


# =========================================================================== shells (hollow, window openings, arches)

def band_paint(name, bands, rough=0.32, coat=0.5, axis='Z'):
    """Glossy paint whose colour changes in bands of OBJECT-space height: bands = [(z_from, colour), ...]
    ascending (the first colour starts at -inf).  Two-tone bodies, belt stripes."""
    nb = L.NB(name, rough=rough)
    tc = nb.n('ShaderNodeTexCoord')
    sep = nb.n('ShaderNodeSeparateXYZ')
    nb.link(tc.outputs['Object'], sep.inputs[0])
    out = None
    col = bands[0][1]
    for z, c in bands[1:]:
        f = nb.map_range(sep.outputs[axis], z - 0.006, z + 0.006)
        out = nb.mix_rgb(f, out if out is not None else col, c)
    nb.base(out if out is not None else col)
    for nm, v in (('Coat Weight', coat), ('Coat Roughness', 0.18)):
        if nm in nb.p.inputs:
            nb.p.inputs[nm].default_value = v
    return nb.m


def add_bool(obj, cutter, transfer=True):
    mod = obj.modifiers.new('cut_' + cutter.name, 'BOOLEAN')
    mod.operation = 'DIFFERENCE'
    mod.object = cutter
    try:
        mod.solver = 'EXACT'
    except Exception:
        pass
    if transfer:
        try:
            mod.material_mode = 'TRANSFER'
        except Exception:
            pass
    cutter.hide_render = True
    cutter.display_type = 'WIRE'
    cutter.visible_shadow = False
    cutter['veh_cutter'] = True
    return mod


def soft_bevel(obj, w=0.018, segs=2, angle=32.0):
    b = obj.modifiers.new('soft', 'BEVEL')
    b.width = w
    b.segments = segs
    b.limit_method = 'ANGLE'
    b.angle_limit = math.radians(angle)
    b.miter_outer = 'MITER_ARC'
    try:
        b.harden_normals = False
    except Exception:
        pass
    return b


def shell(name, size, loc, mat, r=0.25, wall=0.07, inner=None, cuts=(), arches=(), segs=5, hollow=True,
          frame_mat=None, taper=None):
    """Hollow rounded box (origin = bottom centre at loc) with rounded window openings and wheel arches.
    cuts   = [(x0, x1, y0, y1, z0, z1, radius), ...] box cutters (window / door openings), body-local metres
    arches = [(y, z, radius, x0, x1), ...] cylinder cutters along X (wheel arches)
    inner  = material of the inside faces (TRANSFERred from the hollowing cutter), frame_mat = window reveals."""
    sx, sy, sz = size
    o = box(name, size, loc, mat=mat, bevel=r, segs=segs, taper=taper)
    if hollow:
        inn = box(name + '_hol', (sx - 2 * wall, sy - 2 * wall, sz - 2 * wall), (loc[0], loc[1], loc[2] + wall),
                  mat=inner or mat, bevel=max(0.02, r - wall), segs=3)
        add_bool(o, inn)
    fm = frame_mat or inner or mat
    for k, (x0, x1, y0, y1, z0, z1, rr) in enumerate(cuts):
        c = box('%s_win%d' % (name, k), (x1 - x0, y1 - y0, z1 - z0), ((x0 + x1) / 2, (y0 + y1) / 2, z0), mat=fm,
                bevel=rr, segs=3)
        add_bool(o, c)
    for k, (y, z, rr, x0, x1) in enumerate(arches):
        c = cyl('%s_arch%d' % (name, k), rr, x1 - x0, ((x0 + x1) / 2, y, z), rot=(0, 90, 0), mat=flat(INK, 0.8),
                segs=40, origin='center', bevel=0.0)
        add_bool(o, c)
    soft_bevel(o)
    return o


def wheel_well(name, y, z, r, half_w):
    """Dark inner wheel well seen through an arch (sits just inside the body sides)."""
    return cyl(name, r, half_w * 2, (0, y, z), rot=(0, 90, 0), mat=flat('#23262E', 0.9), segs=36,
               origin='center', bevel=0.0)
