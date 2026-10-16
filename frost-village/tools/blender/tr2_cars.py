"""
tr2_cars.py - the real train cars of v4.2 (docs/CONTRACT_V42.md section AK.1), built in the town train framework
(tools/blender/town_train.py: same wheels, lamps, snow, palette, camera, light, ink outline at pack time):

    train_coach    객차 "솔방울호"   sky-blue body, cream window band with gold lines, slate-teal barrel roof with snow,
                                    4 big warm windows per side with seated toy passengers (bobble hats, scarves, two
                                    of them wave), open end platforms with gold railings, steps and a lantern each
    train_boxcar   화물칸           chestnut planks, cream X-braced sliding door (two leaves) on both sides, dark green
                                    roof + walkway + snow, pinecone-crate pictogram, red-brown underframe; door_open
                                    shows the crates inside
    train_flatcar  무개화차         dark oiled-wood deck, red-brown stake pockets + 6 low stakes per side, iron corners,
                                    rolled green tarp + rope coil at the rear, red tail lamps, empty middle (the game
                                    stacks crate icons on cargoSlots)

Local frame (like every Frost Village sprite): front = -Y (the heading), right side = -X (the side the camera sees in
every rendered dir), left = +X, z up, origin = ground point under the car centre on the track centre line.  Wheels
stand on the rail top (RAIL_TOP 0.15 m, gauge 0.9 m - town_rails).  Each car = root empty (yawed per dir) -> body
pivot empty (sway) + bogies/wheels (stay on the rails).

The registry CARS is rendered by tr2_render.py (frames + shadow frames + points per dir) and packed by tr2_pack.py.
"""
import math
from collections import OrderedDict

import bpy
from mathutils import Vector, Euler

import prop_lib as L
from prop_lib import flat, box, cyl, sphere, blob, extrude, tonal
import prop_assets as PA
import bld_assets as BA
import town_train as TT          # read-only reuse: wheel(), roof_curved(), lamp()

RAIL_TOP = TT.RAIL_TOP
GAUGE = TT.GAUGE
DIRS = ['S', 'SE', 'E', 'NE', 'N']
CARS = OrderedDict()

GOLD = '#F2C14E'
DARK = '#2B2F3A'
IRON = '#3D424C'
SNOW = 'snow_mat'


def car(key, anims, length, body, coupler, wheel_r, notes, samples=24):
    def deco(fn):
        CARS[key] = dict(key=key, fn=fn, anims=anims, length=length, body=body, coupler=coupler, wheel_r=wheel_r,
                         samples=samples, notes=notes)
        return fn
    return deco


ANIM_IDLE = {'frames': 1, 'fps': 2, 'repeat': -1, 'dirs': DIRS}
ANIM_MOVE = {'frames': 8, 'fps': 12, 'repeat': -1, 'dirs': DIRS}
ANIM_DOOR = {'frames': 4, 'fps': 10, 'repeat': 0, 'dirs': ['SE', 'NE']}


# =========================================================================== shared parts

def new_empty(name, parent=None, loc=(0, 0, 0)):
    e = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(e)
    e.location = loc
    if parent is not None:
        e.parent = parent
    return e


def attach(o, parent):
    """Parent keeping the object's current (rest) world placement: the root is at the identity while a car is built,
    so the parent's rest matrix is its matrix_basis (the body pivot sits at z 0.45)."""
    o.parent = parent
    o.matrix_parent_inverse = parent.matrix_basis.inverted()


def parent_all(objs, parent):
    for o in BA.top_level(objs):
        if o.parent is None:
            attach(o, parent)


def bogie(name, yc, wr, spread, root, col=DARK):
    """Two-axle bogie centred at local y = yc: red disc wheels (town_train.wheel) on both rails, a dark side frame
    with gold axle-box caps just above the hubs, a bolster under the body.  Returns [(wheel_empty, r)]."""
    wheels = []
    zc = RAIL_TOP + wr
    for k, dy in enumerate((-spread / 2, spread / 2)):
        for s in (-1, 1):
            w = TT.wheel('%s%d%s' % (name, k, 'LR'[s > 0]), wr)
            w.location = (s * GAUGE / 2, yc + dy, zc)
            w.parent = root
            wheels.append((w, wr))
    with L.Collect() as c:
        dm = flat(col, 0.5)
        for s in (-1, 1):
            x = s * (GAUGE / 2 + 0.085)
            box(name + '_side', (0.05, spread + 0.3, 0.075), (x, yc, zc + 0.01), mat=dm, bevel=0.02)
            box(name + '_spring', (0.045, spread * 0.55, 0.05), (x, yc, zc + 0.085), mat=dm, bevel=0.015)
            for dy in (-spread / 2, spread / 2):
                cyl(name + '_axb', 0.055, 0.07, (x + s * 0.015, yc + dy, zc), rot=(0, 90, 0), mat=dm, segs=14,
                    origin='center', bevel=0.012)
                cyl(name + '_cap', 0.032, 0.03, (x + s * 0.055, yc + dy, zc), rot=(0, 90, 0),
                    mat=flat(GOLD, 0.3, 0.7), segs=12, origin='center', bevel=0.006)
        box(name + '_bolster', (GAUGE + 0.12, 0.16, 0.06), (0, yc, zc + 0.07), mat=dm, bevel=0.015)
    parent_all(c.objs, root)
    return wheels


def coupler_stub(name, y_face, sgn, z=0.42):
    """Dark coupler from the buffer beam (y_face - sgn * 0.15) to the coupler face y_face (the cars touch there)."""
    m = flat(DARK, 0.4, 0.5)
    y0 = y_face - sgn * 0.15
    box(name, (0.09, 0.15, 0.075), (0, (y0 + y_face) / 2, z - 0.04), mat=m, bevel=0.02)
    cyl(name + '_k', 0.05, 0.05, (0, y_face - sgn * 0.025, z), rot=(90, 0, 0), mat=m, segs=12, origin='center',
        bevel=0.01)


def buffers(name, y_beam, sgn, z=0.5, spread=0.36):
    for s in (-1, 1):
        cyl(name, 0.045, 0.05, (s * spread, y_beam + sgn * 0.025, z), rot=(90, 0, 0), mat=flat(IRON, 0.4, 0.5),
            segs=12, origin='center')
        cyl(name + '_p', 0.065, 0.02, (s * spread, y_beam + sgn * 0.055, z), rot=(90, 0, 0),
            mat=flat(DARK, 0.4, 0.5), segs=14, origin='center')


def truss(name, y0, y1, z_top, sag, col=DARK):
    """Queen-post truss rods under the frame on both sides (a little underframe detail)."""
    mb = L.MB()
    m = flat(col, 0.45, 0.4)
    for s in (-1, 1):
        x = s * 0.42
        a = Vector((x, y0, z_top))
        b = Vector((x, y0 + (y1 - y0) * 0.33, z_top - sag))
        c = Vector((x, y0 + (y1 - y0) * 0.67, z_top - sag))
        d = Vector((x, y1, z_top))
        for p, q in ((a, b), (b, c), (c, d)):
            mb.seg(p, q, 0.012, m, segs=6)
        for p in (b, c):
            mb.seg(p, Vector((p.x, p.y, z_top)), 0.014, m, segs=6)
    return mb.done(name)


def glow_lamp(name, loc, r=0.05, col='#FFF1C4', emit='#FFD27A', strength=3.5, housing=DARK, facing=-1):
    """Small lamp: dark cup + emissive lens facing local -Y (facing=-1) or +Y."""
    m = L.emissive(name + '_g', col, emit, strength)
    x, y, z = loc
    cyl(name + '_b', r * 1.25, 0.06, (x, y, z), rot=(90, 0, 0), mat=flat(housing, 0.4, 0.5), segs=16,
        origin='center')
    sphere(name + '_l', r, (x, y + facing * 0.03, z), m, scale=(1, 0.6, 1), segs=16, rings=8)
    return m


def drop_extra(objs):
    """Keep only the roof shell of town_train.roof_curved (its two round snow blobs are replaced by roof_snow)."""
    for o in objs[1:]:
        bpy.data.objects.remove(o, do_unlink=True)
    return objs[0]


def roof_snow(name, W, Lg, z, rise, over, seed=0, cover=(0.8, 0.94), T=0.06, nu=22, nv=56, patch=0.0):
    """Soft snow cap draped on a town_train.roof_curved barrel roof (top at z + arc(x)): a single sheet whose
    thickness falls to 0 at a wobbly outline (edges sunk into the roof), with gentle lumps - reads as settled snow,
    not a pasted blob."""
    import bmesh
    from mathutils import noise
    hw = W / 2 + over
    R = hw * hw / (2 * rise) + rise / 2

    def arc(x):
        return math.sqrt(max(0.0, R * R - x * x)) - (R - rise)
    off = Vector((seed * 1.7, seed * 2.9, 0.0))
    bm = bmesh.new()
    rows = []
    for j in range(nv + 1):
        v = -1 + 2 * j / nv
        row = []
        for i in range(nu + 1):
            u = -1 + 2 * i / nu
            ax = cover[0] * hw * (1 + 0.07 * noise.noise(Vector((v * 2.6, 0.3, 0)) + off))
            ay = cover[1] * Lg / 2 * (1 + 0.05 * noise.noise(Vector((u * 2.2, 1.7, 0)) + off))
            x, y = u * ax, v * ay
            d = max(0.0, 1 - abs(u) ** 3) * max(0.0, 1 - abs(v) ** 6)
            bump = 0.25 * noise.noise(Vector((x * 4.0, y * 3.0, 0.5)) + off)
            gap = 1.0
            if patch:                                   # thin patches along the ridge -> separate drifts
                n = noise.noise(Vector((y * 2.0, x * 0.9, 2.0)) + off)
                g = min(1.0, max(0.0, (n + patch) / 0.6))
                gap = g * g * (3 - 2 * g)
            t = T * (d ** 0.5) * (1 + bump) * gap - 0.004
            row.append(bm.verts.new((x, y, z + arc(x) + t)))
        rows.append(row)
    for j in range(nv):
        for i in range(nu):
            bm.faces.new((rows[j][i], rows[j][i + 1], rows[j + 1][i + 1], rows[j + 1][i]))
    return L.finish(name, bm, [flat(SNOW, 0.9)], smooth=True)


# =========================================================================== passengers

SKIN = ['#F6CFAE', '#F1C29E', '#EBB792', '#F6CFAE']
HATS = ['#D9483B', '#F2C230', '#3E8E57', '#E8749A', '#2E4F8A', '#EE7F33', '#8E6BBF', '#3FA7B5', '#C8463D', '#F4F1EA']
COATS = ['#2E4F8A', '#D9483B', '#C9A13A', '#3E7F75', '#8A5A3A', '#5B6FB3', '#B04A6A', '#4E8F5A']
SCARVES = ['#F2C230', '#E8749A', '#F4F1EA', '#D9483B', '#3FA7B5', '#EE7F33', '#9FD36A', '#8E6BBF']


def passenger(name, loc, yaw_deg, k, wave=False, kid=False, root=None):
    """Seated toy passenger seen through a window: coat torso, round head with dot eyes + rosy cheeks, bobble hat
    (or earmuffs / a bun), a scarf; `wave` raises a mitten beside the head (animated by pose_coach).
    Built facing -Y, then yawed.  Returns (group, mitten-or-None)."""
    s = 0.82 if kid else 1.0
    hat = HATS[k % len(HATS)]
    coat = COATS[(k * 3 + 1) % len(COATS)]
    scarf = SCARVES[(k * 5 + 2) % len(SCARVES)]
    skin = SKIN[k % len(SKIN)]
    kind = ('bobble', 'bobble', 'earmuff', 'bobble', 'bun', 'bobble', 'beanie')[k % 7]
    with L.Collect() as c:
        blob(name + '_coat', 0.11 * s, (0, 0.0, 0.1 * s), flat(coat, 0.8), scale=(1.12, 0.85, 1.0), seed=k, amp=0.05,
             subdiv=2)
        hz = 0.27 * s
        hr = 0.1 * s
        sphere(name + '_head', hr, (0, 0, hz), flat(skin, 0.6), segs=20, rings=12)
        eye = flat('#2B2420', 0.4)
        for sx in (-1, 1):
            sphere(name + '_eye', 0.011 * s, (sx * 0.03 * s, -hr * 0.93, hz + 0.004), eye, segs=8, rings=5)
            sphere(name + '_ck', 0.016 * s, (sx * 0.048 * s, -hr * 0.84, hz - 0.03 * s), flat('#F2A0A0', 0.7),
                   scale=(1, 0.5, 0.7), segs=8, rings=5)
        torus = bpy.ops.mesh.primitive_torus_add
        torus(major_radius=0.066 * s, minor_radius=0.027 * s, location=(0, 0, 0.18 * s), major_segments=20,
              minor_segments=8)
        sc = bpy.context.object
        sc.name = name + '_scarf'
        sc.data.materials.append(flat(scarf, 0.85))
        sc.data.shade_smooth()
        box(name + '_tail', (0.04 * s, 0.025 * s, 0.09 * s), (0.03 * s, -0.07 * s, 0.07 * s), rot=(8, 0, -10),
            mat=flat(scarf, 0.85), bevel=0.01)
        hm = flat(hat, 0.85)
        if kind in ('bobble', 'beanie'):
            sphere(name + '_hat', hr * 1.07, (0, 0.004, hz + hr * 0.2), hm, scale=(1, 1, 0.92), segs=20, rings=12)
            torus(major_radius=hr * 0.98, minor_radius=0.018 * s, location=(0, 0.004, hz + hr * 0.12),
                  major_segments=24, minor_segments=8)
            band = bpy.context.object
            band.name = name + '_band'
            band.data.materials.append(flat(SCARVES[(k + 3) % len(SCARVES)] if kind == 'bobble' else hat, 0.85))
            band.data.shade_smooth()
            if kind == 'bobble':
                blob(name + '_pom', 0.034 * s, (0, 0.01, hz + hr * 1.18), flat('#F4F1EA' if hat != '#F4F1EA' else
                                                                                 '#D9483B', 0.95), seed=k + 7,
                     amp=0.25, subdiv=2)
        elif kind == 'earmuff':
            sphere(name + '_hair', hr * 1.04, (0, 0.012, hz + 0.008), flat('#5A3A26', 0.8), scale=(1, 1, 0.98),
                   segs=20, rings=12)
            for sx in (-1, 1):
                sphere(name + '_muff', 0.036 * s, (sx * hr * 0.98, 0.0, hz), hm, scale=(0.7, 1, 1), segs=12, rings=8)
            mb = L.MB()
            pts = [Vector((math.cos(a) * hr * 1.0, 0.0, hz + math.sin(a) * hr * 1.08)) for a in
                   [math.radians(v) for v in range(0, 181, 30)]]
            for p, q in zip(pts, pts[1:]):
                mb.seg(p, q, 0.009 * s, hm, segs=6)
            mb.done(name + '_muffband')
        else:  # bun
            sphere(name + '_hair', hr * 1.05, (0, 0.014, hz + 0.01), flat('#3A2A22', 0.8), scale=(1, 1, 0.98),
                   segs=20, rings=12)
            sphere(name + '_bun', 0.04 * s, (0, 0.03, hz + hr * 1.08), flat('#3A2A22', 0.8), segs=12, rings=8)
            torus(major_radius=0.03 * s, minor_radius=0.01 * s, location=(0, 0.03, hz + hr * 0.92),
                  major_segments=16, minor_segments=6)
            rb = bpy.context.object
            rb.name = name + '_ribbon'
            rb.data.materials.append(hm)
    g = L.group(BA.top_level(c.objs), name, loc=loc, rot=(0, 0, yaw_deg))
    mit = None
    if wave:
        with L.Collect() as c2:
            sphere(name + '_mit', 0.034 * s, (0, 0, 0), flat(SCARVES[(k + 1) % len(SCARVES)], 0.9),
                   scale=(0.85, 0.75, 1.1), segs=12, rings=8)
        mit = c2.objs[0]
        mit.parent = g
        mit.location = (-0.105 * s, -0.04, 0.3 * s)
        arm = cyl(name + '_arm', 0.022 * s, 0.12 * s, (-0.09 * s, -0.01, 0.15 * s), rot=(0, -12, 0),
                  mat=flat(coat, 0.8), segs=10, bevel=0.01)
        arm.parent = g
    if root is not None:
        attach(g, root)
    return g, mit


# =========================================================================== coach

COACH_NOTE = ('객차 "솔방울호" passenger coach (3.0 m over the couplers, body 2.7 m, 1.25 x 1.85 m): sky-blue lower '
              'body with a gold pinecone emblem and a blank gold name plate mid-side, cream window band with thin gold '
              'lines, a slate-teal barrel roof with a snow cap and little vents (never red: it must not continue the '
              'engine cab), 4 big warm-lit windows per side with 2-3 seated toy passengers each (bobble hats, '
              'earmuffs, scarves; two of them wave), open end platforms with gold railings, steps on both sides and a '
              'lantern at each end, dark bogies with red disc wheels. idle = standing (1 f); move = 8-frame loop: one '
              'wheel turn (45 deg / frame), a gentle body sway, the wavers wave. doorPoints = ground beside the '
              'platform steps (L/R x front/rear) where passengers step on / off; windowPoints = lit window centres '
              '(night glow); lampPoints = the two end lanterns.')

CO = dict(L=2.7, W=1.22, floor=0.48, belt=1.02, win0=1.07, win1=1.56, eave=1.62, wall_half=1.08, plat=0.27,
          roof_rise=0.17, wr=0.19, bogie_y=0.78, spread=0.5)


def coach_window_ys():
    wl = CO['wall_half'] * 2
    n, ww = 4, 0.42
    pier = (wl - n * ww) / (n + 1)
    return [-CO['wall_half'] + pier * (i + 1) + ww * (i + 0.5) for i in range(n)], ww, pier


@car('train_coach', anims={'idle': ANIM_IDLE, 'move': ANIM_MOVE}, length=3.0, body=2.7,
     coupler={'front': -1.5, 'back': 1.5}, wheel_r=0.19, notes=COACH_NOTE)
def b_coach():
    root = new_empty('train')
    body = new_empty('body', root, (0, 0, 0.45))          # sway pivot at the frame
    W, Lh = CO['W'], CO['L'] / 2
    z0, zb, z1 = CO['floor'], CO['belt'], CO['eave']
    w0, w1 = CO['win0'], CO['win1']
    wh = CO['wall_half']
    blue, cream, teal = '#5DA9DD', '#F6EBD2', '#3E6E78'
    wys, ww, pier = coach_window_ys()
    wavers = []
    with L.Collect() as c:
        # underframe + truss + buffer beams
        box('frame', (0.96, 2 * Lh - 0.04, 0.12), (0, 0, 0.36), mat=flat(DARK, 0.5), bevel=0.03)
        truss('truss', -0.5, 0.5, 0.36, 0.1)
        for e in (-1, 1):
            box('beam', (1.04, 0.07, 0.16), (0, e * (Lh - 0.035), 0.36), mat=flat('#7A3B2E', 0.5), bevel=0.02)
            buffers('buf', e * Lh, e)
            coupler_stub('cpl%d' % (e > 0), e * 1.5, e)
        # lower body (solid, sky blue) = the passengers' floor inside
        box('lower', (W, 2 * wh, zb - z0), (0, 0, z0), mat=flat(blue, 0.45), bevel=0.035)
        box('skirt', (W - 0.04, 2 * wh - 0.04, 0.06), (0, 0, z0 - 0.05), mat=flat('#3F7FB0', 0.5), bevel=0.02)
        gm = flat(GOLD, 0.3, 0.7)
        for s in (-1, 1):
            xo = s * (W / 2 + 0.004)
            box('gl_belt', (0.022, 2 * wh + 0.01, 0.035), (xo, 0, zb - 0.03), mat=gm, bevel=0.006)
            box('gl_low', (0.022, 2 * wh + 0.01, 0.022), (xo, 0, z0 + 0.06), mat=gm, bevel=0.005)
            box('gl_top', (0.022, 2 * wh + 0.01, 0.022), (xo, 0, z1 - 0.06), mat=gm, bevel=0.005)
            # name plate (blank) + pinecone emblem medallion mid-side on the blue panel
            box('plate', (0.024, 0.5, 0.085), (s * (W / 2 + 0.006), 0, 0.85), mat=gm, bevel=0.015)
            box('plate_in', (0.02, 0.44, 0.05), (s * (W / 2 + 0.014), 0, 0.867), mat=flat('#D9A93A', 0.35, 0.6),
                bevel=0.008)
            cyl('medal', 0.085, 0.022, (s * (W / 2 + 0.008), 0, 0.66), rot=(0, 90, 0), mat=gm, segs=24,
                origin='center', bevel=0.008)
            sphere('cone', 0.042, (s * (W / 2 + 0.024), 0, 0.655), flat('#8A5A33', 0.6), scale=(0.5, 0.8, 1.15),
                   segs=12, rings=8)
            for kk, (dy, dz) in enumerate(((-0.02, 0.0), (0.02, 0.0), (-0.012, 0.03), (0.012, 0.03), (0, -0.032))):
                sphere('scale', 0.014, (s * (W / 2 + 0.042), dy, 0.655 + dz), flat('#B9853F', 0.6),
                       scale=(0.5, 1, 1), segs=8, rings=5)
            sphere('leaf', 0.022, (s * (W / 2 + 0.03), 0.0, 0.72), flat('#3E8E57', 0.7), scale=(0.4, 1.4, 0.6),
                   segs=10, rings=6)
            # window band: sill, header, piers (openings between them)
            xw = s * (W / 2 - 0.025)
            box('sill', (0.05, 2 * wh, w0 - zb), (xw, 0, zb), mat=flat(cream, 0.55), bevel=0.01)
            box('header', (0.05, 2 * wh, z1 - w1), (xw, 0, w1), mat=flat(cream, 0.55), bevel=0.01)
            edges = [-wh] + [y for wy in wys for y in (wy - ww / 2, wy + ww / 2)] + [wh]
            for a, b in zip(edges[0::2], edges[1::2]):
                box('pier', (0.05, b - a, w1 - w0), (xw, (a + b) / 2, w0), mat=flat(cream, 0.55), bevel=0.008)
            for wy in wys:                                 # gold window frames
                xf = s * (W / 2 + 0.006)
                for dz, h in ((w0 - 0.012, 0.024), (w1 - 0.012, 0.024)):
                    box('wf', (0.02, ww + 0.04, h), (xf, wy, dz), mat=gm, bevel=0.005)
                for dy in (-ww / 2 - 0.008, ww / 2 + 0.008):
                    box('wf', (0.02, 0.024, w1 - w0 + 0.02), (xf, wy + dy, w0 - 0.01), mat=gm, bevel=0.005)
                # little scalloped valance (cream-pink) across the window top
                box('val', (0.03, ww - 0.02, 0.045), (s * (W / 2 - 0.06), wy, w1 - 0.06), mat=flat('#E8749A', 0.8),
                    bevel=0.012)
        # interior: warm floor (on the lower body), benches with red velvet backs along both walls
        box('ifloor', (W - 0.1, 2 * wh - 0.1, 0.012), (0, 0, zb), mat=flat('#B5764A', 0.7), bevel=0.0)
        for s in (-1, 1):
            box('bench', (0.24, 2 * wh - 0.14, 0.05), (s * 0.42, 0, zb), mat=flat('#8A5A33', 0.7), bevel=0.012)
            box('bback', (0.06, 2 * wh - 0.14, 0.34), (s * 0.24, 0, zb), mat=flat('#B23A48', 0.8), bevel=0.02)
            box('bbtop', (0.08, 2 * wh - 0.14, 0.03), (s * 0.24, 0, zb + 0.34), mat=flat('#8A5A33', 0.7),
                bevel=0.01)
        box('aisle', (0.28, 2 * wh - 0.14, 0.014), (0, 0, zb + 0.004), mat=flat('#C8463D', 0.85), bevel=0.0)
        # end walls with a teal door + lit door window
        for e in (-1, 1):
            ye = e * (wh - 0.025)
            box('endw', (W - 0.02, 0.05, z1 - zb), (0, ye, zb), mat=flat(cream, 0.55), bevel=0.012)
            yd = e * (wh + 0.004)
            box('door', (0.4, 0.02, 0.98), (0, yd, z0 + 0.04), mat=flat('#2F6C8C', 0.5), bevel=0.02)
            box('doorwin', (0.22, 0.024, 0.24), (0, yd + e * 0.004, z0 + 0.66),
                mat=L.emissive('dwin%d' % (e > 0), '#FFE2A0', '#FFC86A', 1.6), bevel=0.012)
            box('doorwf', (0.26, 0.02, 0.28), (0, yd + e * 0.002, z0 + 0.64), mat=gm, bevel=0.008)
            sphere('knob', 0.02, (0.13, yd + e * 0.02, z0 + 0.5), gm, segs=10, rings=6)
            for s in (-1, 1):                              # gold corner trims
                box('ctrim', (0.03, 0.03, z1 - z0), (s * (W / 2 - 0.005), e * (wh - 0.005), z0), mat=gm,
                    bevel=0.008)
            # open end platform: plank floor, end railing with a gap at the steps, side grab bars, steps
            yp0, yp1 = e * wh, e * (Lh - 0.02)
            yc = (yp0 + yp1) / 2
            box('plat', (W - 0.06, abs(yp1 - yp0), 0.05), (0, yc, z0 - 0.05),
                mat=L.stripes('#A86F42', '#8A5A33', 14.0, 'X', soft=0.04), bevel=0.012)
            mb = L.MB()
            rz = z0 + 0.4
            ye2 = e * (Lh - 0.05)
            for x in (-0.5, -0.17, 0.17, 0.5):
                mb.seg(Vector((x, ye2, z0)), Vector((x, ye2, rz)), 0.016, gm, segs=6)
            mb.seg(Vector((-0.52, ye2, rz)), Vector((0.52, ye2, rz)), 0.018, gm, segs=6)
            mb.seg(Vector((-0.52, ye2, z0 + 0.2)), Vector((0.52, ye2, z0 + 0.2)), 0.012, gm, segs=6)
            for s in (-1, 1):
                x = s * (W / 2 - 0.04)
                mb.seg(Vector((x, ye2, rz)), Vector((x, ye2 - e * 0.1, rz)), 0.016, gm, segs=6)
                mb.seg(Vector((x, e * (wh + 0.03), z0 + 0.08)), Vector((x, e * (wh + 0.03), z0 + 0.62)), 0.014, gm,
                       segs=6)
            mb.done('rail%d' % (e > 0))
            for s in (-1, 1):                              # two-tread steps under the platform side
                x = s * (W / 2 - 0.04)
                for k, dz in enumerate((0.16, 0.3)):
                    box('step', (0.16, 0.2, 0.025), (x + s * 0.02 * (2 - k), yc, z0 - dz), mat=flat('#8A5A33', 0.7),
                        bevel=0.008)
                box('hang', (0.02, 0.18, 0.3), (x + s * 0.07, yc, z0 - 0.3), mat=flat(DARK, 0.5), bevel=0.006)
            # lantern hung from the roof edge over the platform
            yl = e * (Lh - 0.08)
            cyl('lhook', 0.008, 0.08, (-0.47, yl, z1 - 0.08), mat=flat(DARK, 0.5), segs=6)
            PA.lantern('lant%d' % (e > 0), (-0.47, yl, z1 - 0.31), size=0.1, strength=4.5, light=False)
        # roof: slate teal barrel over body + platforms, gold eave line, vents, snow
        drop_extra(TT.roof_curved('roof', W + 0.02, 2 * Lh - 0.06, z1, rise=CO['roof_rise'], col=teal, over=0.05,
                                  seed=6, long_snow=False))
        roof_snow('roofsnow', W + 0.02, 2 * Lh - 0.06, z1, CO['roof_rise'], 0.05, seed=6, cover=(0.6, 0.88), T=0.07,
                  patch=0.22)
        for k, (yy, xx, rr) in enumerate(((-1.12, -0.32, 0.07), (0.62, 0.36, 0.06), (1.16, 0.1, 0.06))):
            PA.snow_cap('rlump%d' % k, rr, (xx, yy, z1 + CO['roof_rise'] + 0.02 - abs(xx) * 0.12), 0.05, 70 + k,
                        scale=(1.3, 1.0, 1.0))
        for s in (-1, 1):
            box('eave', (0.02, 2 * Lh - 0.1, 0.03), (s * (W / 2 + 0.07), 0, z1 - 0.045), mat=gm, bevel=0.006)
        for k, y in enumerate((-0.75, 0.0, 0.75)):
            cyl('vent', 0.05, 0.11, (0.18 * (1 if k % 2 else -1), y, z1 + CO['roof_rise'] - 0.035),
                mat=flat('#2E5560', 0.5), segs=14, bevel=0.012)
            PA.snow_cap('vsnow%d' % k, 0.05, (0.18 * (1 if k % 2 else -1), y, z1 + CO['roof_rise'] + 0.075), 0.03,
                        20 + k)
        L.point_light('ilight0', (0.0, -0.5, 1.45), 'window', 7.0, 0.3)
        L.point_light('ilight1', (0.0, 0.5, 1.45), 'window', 7.0, 0.3)
    parent_all(c.objs, body)
    # passengers: one row on each bench, 2-3 per window, facing out of their window
    k = 0
    per = {-1: (2, 3, 2, 2), 1: (2, 2, 3, 2)}
    wave_at = {(-1, 0, 1), (-1, 2, 0), (1, 1, 0), (1, 3, 1)}
    for s in (-1, 1):
        for wi, wy in enumerate(wys):
            n = per[s][wi]
            for j in range(n):
                dy = (j - (n - 1) / 2) * (0.125 if n == 3 else 0.2)
                kid = (k % 5 == 3) or (n == 3 and j == 1)
                depth = 0.42 - (0.06 if (n == 3 and j == 1) else 0.0)
                g, mit = passenger('pax%d' % k, (s * depth, wy + dy, zb + 0.03), -90 if s < 0 else 90, k,
                                   wave=(s, wi, j) in wave_at, kid=kid, root=body)
                if mit is not None:
                    wavers.append((mit, mit.location.copy(), k))
                k += 1
    wheels = []
    for e in (-1, 1):
        wheels += bogie('bg%d' % (e > 0), e * CO['bogie_y'], CO['wr'], CO['spread'], root)
    # points (car-local metres)
    ysteps = [-(wh + Lh) / 2, (wh + Lh) / 2]
    door = {'L': [(0.86, ysteps[0], 0.0), (0.86, ysteps[1], 0.0)],
            'R': [(-0.86, ysteps[0], 0.0), (-0.86, ysteps[1], 0.0)]}
    windows = []
    for s in (-1, 1):
        for wy in wys:
            windows.append(((s * (W / 2 + 0.01), wy, (w0 + w1) / 2), (s, 0.0)))
    for e in (-1, 1):
        windows.append(((0.0, e * (wh + 0.03), z0 + 0.78), (0.0, e)))
    lamps = [(-0.47, -(Lh - 0.08), z1 - 0.23), (-0.47, Lh - 0.08, z1 - 0.23)]
    return {'group': root, 'body': body, 'wheels': wheels, 'pose': pose_coach, 'wavers': wavers,
            'points': {'doorPoints': door, 'windowPoints': windows, 'lampPoints': lamps},
            'head_ref': Vector((0, 0, z1 + CO['roof_rise'] + 0.06))}


def sway(B, anim, i, n):
    body = B['body']
    if anim == 'move':
        t = i / float(n)
        body.location.z = 0.45 + 0.006 * math.sin(2 * math.tau * t)
        body.rotation_euler.y = math.radians(0.9 * math.sin(math.tau * t))
        return 0.4 + math.tau * t
    body.location.z = 0.45
    body.rotation_euler.y = 0.0
    return 0.4


def set_wheels(B, ang):
    for w, r in B['wheels']:
        w.rotation_euler = Euler((ang, 0, 0), 'XYZ')


def pose_coach(B, anim, i, n):
    ang = sway(B, anim, i, n)
    set_wheels(B, ang)
    for mit, rest, k in B['wavers']:
        f = i / float(n) if anim == 'move' else 0.0        # idle == move frame 0 (aliased in the atlas)
        ph = math.tau * 2 * f + k
        mit.location = rest + Vector((0.0, 0.035 * math.sin(ph), 0.012 * math.cos(ph)))


# =========================================================================== box car

BOX_NOTE = ('화물칸 box car (2.6 m over the couplers, body 2.3 m, 1.3 x 1.9 m): warm chestnut planks, a cream '
            'X-brace on each half of the sliding door (two leaves) on both sides, a dark green barrel roof with a '
            'plank roof walkway and a snow cap, an end ladder, a cream pinecone-crate pictogram (no text) beside the '
            'door, red-brown underframe, dark bogies with red disc wheels. idle / move closed; door_open (SE, NE, '
            '4 f once; the game plays it reversed to close) slides both leaves apart and shows the crates and sacks '
            'inside under a warm lamp. doorPoints = ground beside each door half (where crates fly in); cargoPoint = '
            'the floor just inside the open door.')

BX = dict(L=2.3, W=1.26, floor=0.52, eave=1.6, wall_half=1.1, door_half=0.42, door_z1=1.48, roof_rise=0.13,
          wr=0.19, bogie_y=0.7, spread=0.5)


@car('train_boxcar', anims={'idle': ANIM_IDLE, 'move': ANIM_MOVE, 'door_open': ANIM_DOOR}, length=2.6, body=2.3,
     coupler={'front': -1.3, 'back': 1.3}, wheel_r=0.19, notes=BOX_NOTE)
def b_boxcar():
    root = new_empty('train')
    body = new_empty('body', root, (0, 0, 0.45))
    W, Lh, wh = BX['W'], BX['L'] / 2, BX['wall_half']
    z0, z1 = BX['floor'], BX['eave']
    dh, dz1 = BX['door_half'], BX['door_z1']
    chest = '#8A5A3A'
    planks = L.stripes('#8A5A3A', '#7C5034', 9.0, 'Y', rough=0.75, soft=0.06)
    planks_x = L.stripes('#8A5A3A', '#7C5034', 9.0, 'X', rough=0.75, soft=0.06)
    trim = flat('#5E3B26', 0.6)
    cream = flat('#F2E6CC', 0.6)
    leaves = []
    with L.Collect() as c:
        box('frame', (0.98, 2 * Lh - 0.04, 0.12), (0, 0, 0.38), mat=flat('#7A3B2E', 0.5), bevel=0.03)
        truss('truss', -0.42, 0.42, 0.38, 0.09, col='#5A2E24')
        for e in (-1, 1):
            box('beam', (1.06, 0.07, 0.16), (0, e * (Lh - 0.035), 0.37), mat=flat('#7A3B2E', 0.5), bevel=0.02)
            buffers('buf', e * Lh, e)
            coupler_stub('cpl%d' % (e > 0), e * 1.3, e)
        box('floorb', (W, 2 * wh, 0.04), (0, 0, z0 - 0.02), mat=flat('#5E3B26', 0.7), bevel=0.01)
        # walls: thin plank panels (hollow box, the door opening on each side)
        t = 0.05
        for s in (-1, 1):
            xw = s * (W / 2 - t / 2)
            for a, b in ((-wh, -dh), (dh, wh)):
                box('wall', (t, b - a, z1 - z0), (xw, (a + b) / 2, z0), mat=planks, bevel=0.012)
            box('lintel', (t, 2 * dh, z1 - dz1), (xw, 0, dz1), mat=planks, bevel=0.01)
            xo = s * (W / 2 + 0.006)
            for zz in (z0 + 0.02, z1 - 0.07):              # top / bottom trim rails
                box('trim', (0.03, 2 * wh, 0.06), (xo, 0, zz), mat=trim, bevel=0.01)
            for yy in (-wh + 0.03, wh - 0.03, -dh - 0.035, dh + 0.035):
                box('post', (0.035, 0.06, z1 - z0), (xo + s * 0.004, yy, z0), mat=trim, bevel=0.01)
            box('drail', (0.03, 4 * dh + 0.1, 0.035), (s * (W / 2 + 0.05), 0, dz1 + 0.035), mat=flat(DARK, 0.5),
                bevel=0.008)
            box('dguide', (0.03, 4 * dh + 0.1, 0.025), (s * (W / 2 + 0.05), 0, z0 + 0.0), mat=flat(DARK, 0.5),
                bevel=0.006)
            # pinecone crate pictogram (no text) on the rear panel
            yp = (dh + wh) / 2 + 0.02
            xp = s * (W / 2 + 0.014)
            box('pic', (0.012, 0.24, 0.26), (xp, yp, 0.98), mat=cream, bevel=0.03)
            box('pic_crate', (0.012, 0.15, 0.1), (xp + s * 0.008, yp, 1.0), mat=flat('#B97C48', 0.7), bevel=0.008)
            box('pic_line', (0.012, 0.15, 0.012), (xp + s * 0.012, yp, 1.046), mat=flat('#6B4226', 0.7), bevel=0.0)
            sphere('pic_cone', 0.045, (xp + s * 0.01, yp, 1.155), flat('#8A5A33', 0.6), scale=(0.35, 0.75, 1.0),
                   segs=12, rings=8)
            sphere('pic_leaf', 0.03, (xp + s * 0.012, yp + 0.045, 1.195), flat('#3E8E57', 0.7),
                   scale=(0.35, 1.0, 0.55), rot=(0, 0, 0), segs=10, rings=6)
            # route-card holder on the front panel
            box('card', (0.012, 0.12, 0.08), (xp, -(dh + wh) / 2 - 0.02, 1.08), mat=flat('#E8E2D0', 0.6),
                bevel=0.01)
        for e in (-1, 1):
            box('endw', (W, t, z1 - z0), (0, e * (wh - t / 2), z0), mat=planks_x, bevel=0.012)
            for s in (-1, 1):
                box('ecorner', (0.06, 0.035, z1 - z0), (s * (W / 2 - 0.03), e * (wh + 0.005), z0), mat=trim,
                    bevel=0.01)
        # ladder on the right-rear corner end
        mb = L.MB()
        im = flat(IRON, 0.45, 0.4)
        ye = wh + 0.04
        for x in (-0.5, -0.32):
            mb.seg(Vector((x, ye, z0 + 0.05)), Vector((x, ye, z1 + 0.08)), 0.012, im, segs=6)
        for k in range(5):
            z = z0 + 0.15 + k * 0.2
            mb.seg(Vector((-0.5, ye, z)), Vector((-0.32, ye, z)), 0.01, im, segs=6)
        mb.done('ladder')
        # roof: dark green barrel, walkway on top, snow
        drop_extra(TT.roof_curved('roof', W + 0.02, 2 * wh + 0.08, z1, rise=BX['roof_rise'], col='#2F5D46',
                                  over=0.05, seed=9, long_snow=False))
        rz = z1 + BX['roof_rise'] + 0.06
        for y in (-0.8, -0.27, 0.27, 0.8):
            box('wsup', (0.3, 0.05, 0.08), (0, y, rz - 0.07), mat=flat('#5E3B26', 0.7), bevel=0.008)
        box('walk', (0.26, 2 * wh + 0.02, 0.03), (0, 0, rz + 0.01),
            mat=L.stripes('#A9784A', '#8F6239', 22.0, 'Y', soft=0.04), bevel=0.008)
        roof_snow('roofsnow', W + 0.02, 2 * wh + 0.08, z1, BX['roof_rise'], 0.05, seed=9, cover=(0.66, 0.86), T=0.05,
                  patch=0.2)
        L.snow_slab('wsnow', 0.2, 0.55, 0.03, (0.02, 0.45, rz + 0.04), seed=12)
        L.snow_slab('wsnow2', 0.2, 0.3, 0.025, (-0.01, -0.62, rz + 0.04), seed=13)
        # inside (seen when the door is open): warm plank lining, crates + sacks + a barrel facing the door, a lamp
        for s in (-1, 1):
            for a, b in ((-wh + 0.05, -dh), (dh, wh - 0.05)):
                box('lining', (0.02, b - a, z1 - z0 - 0.04), (s * (W / 2 - 0.06), (a + b) / 2, z0),
                    mat=flat('#A0703F', 0.8), bevel=0.0)
        box('ifloor', (W - 0.12, 2 * wh - 0.1, 0.012), (0, 0, z0), mat=flat('#B9874F', 0.8), bevel=0.0)
        PA.crate_model('icr1', 0.36, (0.3, -0.2, z0), rot=(0, 0, 6), snow=False, seed=41)
        PA.crate_model('icr2', 0.32, (0.31, -0.2, z0 + 0.36), rot=(0, 0, -7), snow=False, seed=42)
        PA.crate_model('icr3', 0.36, (0.3, 0.62, z0), rot=(0, 0, -8), snow=False, seed=43)
        PA.crate_model('icr4', 0.34, (0.3, -0.64, z0), rot=(0, 0, 10), snow=False, seed=44)
        PA.crate_model('icr5', 0.3, (0.3, 0.62, z0 + 0.36), rot=(0, 0, 9), snow=False, seed=45)
        PA.barrel_model('ibar', loc=(0.32, 0.22, z0), scale=0.44, snow=False, seed=48)
        BA.sack('isack1', (0.06, 0.3, z0), s=0.7, seed=46)
        BA.sack('isack2', (0.08, -0.5, z0), s=0.65, seed=47, col='#CDB98E')
        PA.lantern('ilamp', (0.05, 0.0, z1 - 0.3), size=0.09, strength=5.0, light=False)
        cyl('ilhook', 0.008, 0.12, (0.05, 0.0, z1 - 0.13), mat=flat(DARK, 0.5), segs=6)
        L.point_light('ilight', (-0.15, 0.0, 1.3), 'window', 18.0, 0.25)
    parent_all(c.objs, body)
    # sliding door leaves (both sides): two plank leaves with cream X-braces, outside the wall on the rails
    for s in (-1, 1):
        for e in (-1, 1):
            with L.Collect() as c2:
                lw, lh = dh, dz1 - z0 - 0.02
                box('leaf', (0.035, lw, lh), (0, 0, 0), mat=flat('#946342', 0.7), bevel=0.012)
                box('lframe', (0.04, lw, 0.045), (0, 0, 0), mat=cream, bevel=0.01)
                box('lframe', (0.04, lw, 0.045), (0, 0, lh - 0.045), mat=cream, bevel=0.01)
                for yy in (-lw / 2 + 0.022, lw / 2 - 0.022):
                    box('lframe', (0.04, 0.045, lh), (0, yy, 0), mat=cream, bevel=0.01)
                d = math.degrees(math.atan2(lh - 0.09, lw - 0.045))
                ln = math.hypot(lh - 0.09, lw - 0.045)
                for sg in (-1, 1):
                    box('xbrace', (0.042, 0.045, ln), (0, 0, lh / 2), rot=(sg * (90 - d), 0, 0), mat=cream,
                        bevel=0.01, origin='center')
                box('handle', (0.03, 0.03, 0.14), (s * 0.03, -e * (lw / 2 - 0.06), lh * 0.45), mat=flat(IRON, 0.4, 0.5),
                    bevel=0.008)
                for yy in (-lw / 2 + 0.08, lw / 2 - 0.08):
                    cyl('roller', 0.03, 0.03, (s * 0.0, yy, lh + 0.03), rot=(0, 90, 0), mat=flat(DARK, 0.4, 0.5),
                        segs=10, origin='center')
            g = L.group(BA.top_level(c2.objs), 'leaf%d%d' % (s > 0, e > 0))
            attach(g, body)
            rest = Vector((s * (W / 2 + 0.048), e * dh / 2, z0 + 0.01))
            g.location = rest
            leaves.append((g, rest, e))
    wheels = []
    for e in (-1, 1):
        wheels += bogie('bg%d' % (e > 0), e * BX['bogie_y'], BX['wr'], BX['spread'], root, col='#3A2620')
    door = {'L': [(0.9, -dh / 2, 0.0), (0.9, dh / 2, 0.0)], 'R': [(-0.9, -dh / 2, 0.0), (-0.9, dh / 2, 0.0)]}
    return {'group': root, 'body': body, 'wheels': wheels, 'pose': pose_boxcar, 'leaves': leaves,
            'points': {'doorPoints': door, 'cargoPoint': (-0.3, 0.0, z0 + 0.02)},
            'head_ref': Vector((0, 0, z1 + BX['roof_rise'] + 0.1))}


DOOR_OPEN = [0.16, 0.46, 0.8, 1.0]


def pose_boxcar(B, anim, i, n):
    ang = sway(B, anim, i, n)
    set_wheels(B, ang)
    f = DOOR_OPEN[i] if anim == 'door_open' else 0.0
    for g, rest, e in B['leaves']:
        g.location = rest + Vector((0.0, e * BX['door_half'] * f, 0.0))


# =========================================================================== flat car

FLAT_NOTE = ('무개화차 flat car (2.4 m over the couplers, body 2.1 m, 1.3 x 0.75 m, deck 0.55 m): dark oiled-wood '
             'plank deck, red-brown side sills with stake pockets and 6 low stakes per side, iron corner plates, a '
             'rolled green tarp lashed with rope + a rope coil at the rear end, a small red tail lamp at each end, a '
             'little snow at the edges; the middle of the deck is EMPTY: the game stacks crate icons (lgx items at '
             'cargoScale, stackStep px apart) on cargoSlots (2 rows x 3, bottom-centre of each stack on the deck, '
             'sorted back to front). idle 1 f, move 8 f (wheel turn + gentle sway).')

FL = dict(L=2.1, W=1.3, deck=0.55, wr=0.17, bogie_y=0.68, spread=0.44)
FL_SLOTS = [(x, y) for y in (-0.62, -0.12, 0.38) for x in (-0.3, 0.3)]


@car('train_flatcar', anims={'idle': ANIM_IDLE, 'move': ANIM_MOVE}, length=2.4, body=2.1,
     coupler={'front': -1.2, 'back': 1.2}, wheel_r=0.17, notes=FLAT_NOTE)
def b_flatcar():
    root = new_empty('train')
    body = new_empty('body', root, (0, 0, 0.45))
    W, Lh, zd = FL['W'], FL['L'] / 2, FL['deck']
    rb = flat('#7A3B2E', 0.55)
    with L.Collect() as c:
        box('frame', (0.9, 2 * Lh - 0.06, 0.1), (0, 0, 0.36), mat=flat(DARK, 0.5), bevel=0.03)
        truss('truss', -0.4, 0.4, 0.36, 0.08, col='#5A2E24')
        for e in (-1, 1):
            buffers('buf', e * Lh, e, z=0.47)
            coupler_stub('cpl%d' % (e > 0), e * 1.2, e)
        # sills (red-brown) + end beams
        for s in (-1, 1):
            box('sill', (0.07, 2 * Lh, 0.13), (s * (W / 2 - 0.035), 0, zd - 0.13), mat=rb, bevel=0.015)
        for e in (-1, 1):
            box('ebeam', (W, 0.07, 0.15), (0, e * (Lh - 0.035), zd - 0.14), mat=rb, bevel=0.015)
        # dark oiled-wood deck (planks across)
        box('deck', (W - 0.08, 2 * Lh - 0.08, 0.05), (0, 0, zd - 0.05),
            mat=L.stripes('#5A3E2B', '#4C3324', 16.0, 'Y', rough=0.55, soft=0.05), bevel=0.01)
        # stake pockets + 6 low stakes per side
        for s in (-1, 1):
            for k in range(6):
                y = -Lh + 0.16 + k * (2 * Lh - 0.32) / 5
                box('pocket', (0.05, 0.08, 0.1), (s * (W / 2 + 0.02), y, zd - 0.12), mat=rb, bevel=0.01)
                box('stake', (0.045, 0.045, 0.32), (s * (W / 2 + 0.02), y, zd - 0.11),
                    mat=tonal('#8A5A33', 0.12, 5.0, rough=0.8), bevel=0.012)
                if (k + (s > 0)) % 3 == 0:
                    PA.snow_cap('ssnow%d%d' % (s > 0, k), 0.03, (s * (W / 2 + 0.02), y, zd + 0.21), 0.02, 50 + k)
        # iron corner plates
        for s in (-1, 1):
            for e in (-1, 1):
                box('corner', (0.12, 0.12, 0.16), (s * (W / 2 - 0.04), e * (Lh - 0.04), zd - 0.14),
                    mat=flat(IRON, 0.4, 0.5), bevel=0.02)
        # rolled green tarp + rope lashings + a rope coil at the rear (+Y) end
        cyl('tarp', 0.12, W - 0.24, (0, Lh - 0.2, zd + 0.12), rot=(0, 90, 0), mat=tonal('#3E7F55', 0.08, 6.0),
            segs=24, origin='center', bevel=0.04)
        cyl('tarp_end', 0.07, W - 0.2, (0, Lh - 0.2, zd + 0.12), rot=(0, 90, 0), mat=flat('#346B48', 0.8), segs=16,
            origin='center', bevel=0.02)
        for x in (-0.36, 0.0, 0.36):
            bpy.ops.mesh.primitive_torus_add(major_radius=0.125, minor_radius=0.012, location=(x, Lh - 0.2, zd + 0.12),
                                             rotation=(0, math.radians(90), 0), major_segments=20, minor_segments=6)
            o = bpy.context.object
            o.name = 'lash'
            o.data.materials.append(flat('#D9C39A', 0.85))
        for k in range(3):
            bpy.ops.mesh.primitive_torus_add(major_radius=0.085 - 0.012 * k, minor_radius=0.016,
                                             location=(0.34, Lh - 0.48, zd + 0.016 + 0.024 * k), major_segments=20,
                                             minor_segments=6)
            o = bpy.context.object
            o.name = 'coil'
            o.data.materials.append(flat('#D9C39A', 0.85))
        for k, (xx, rr) in enumerate(((-0.22, 0.09), (0.3, 0.07))):
            PA.snow_cap('tsnow%d' % k, rr, (xx, Lh - 0.2, zd + 0.225), 0.035, 61 + k, scale=(1.8, 0.8, 1.0))
        for k, (xx, yy, rr) in enumerate(((-0.5, -Lh + 0.12, 0.07), (0.45, -Lh + 0.1, 0.05), (-0.52, 0.2, 0.05))):
            PA.snow_cap('csnow%d' % k, rr, (xx, yy, zd), 0.03, 64 + k, scale=(1.2, 0.8, 1.0))
        # tail lamps (red) at both ends, right side
        for e in (-1, 1):
            cyl('lpost', 0.015, 0.12, (-0.5, e * (Lh - 0.02), zd), mat=flat(DARK, 0.5), segs=8)
            glow_lamp('tail%d' % (e > 0), (-0.5, e * (Lh + 0.005), zd + 0.16), r=0.04, col='#FF6B5A', emit='#FF4A3A',
                      strength=3.0, facing=e)
    parent_all(c.objs, body)
    wheels = []
    for e in (-1, 1):
        wheels += bogie('bg%d' % (e > 0), e * FL['bogie_y'], FL['wr'], FL['spread'], root)
    return {'group': root, 'body': body, 'wheels': wheels, 'pose': pose_flatcar,
            'points': {'lampPoints': [(-0.5, -(Lh + 0.02), zd + 0.16), (-0.5, Lh + 0.02, zd + 0.16)],
                       'cargoSlots': [(x, y, zd) for x, y in FL_SLOTS]},
            'head_ref': Vector((0, 0, zd + 0.3))}


def pose_flatcar(B, anim, i, n):
    set_wheels(B, sway(B, anim, i, n))
