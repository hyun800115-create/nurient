"""
town_lib.py - modelling helpers for the neighbour town "솔방울 마을" (docs/CONTRACT_V4.md section K).

Everything is built with the SAME helpers, palette, camera, light and PPU as the village props: prop_lib,
prop_assets (shared sub-models), life_assets (two-sided roof, snow drift) and bld_assets (windows, gable
roofs, markers) are imported READ-ONLY and never modified.

Conventions (as bld_assets.py)
  * 1 unit = 1 m, world origin = footprint centre = sprite anchor, local front = -Y (screen down-left);
    the +X side (screen down-right) is the other face the camera sees.
  * Wall-mounted parts (doors, shop windows, signs) are built in a FACE frame: the wall surface is the plane
    y = 0, outward = -y, x runs along the wall, z up; face_group() turns that frame onto a wall
    ('y-' front, 'x+' right side, 'y+' back, 'x-' left side) exactly like bld_assets.window().
  * Emblems (the big iconic shop signs: coffee cup, scissors, flower, book, teddy bear ...) are built in a SIGN
    frame: the picture lies in the XZ plane centred on the origin and bulges toward -Y (the viewer);
    sign_disc() / emblem_at() rotate that frame so it faces the camera (psi = 45 deg) or any heading.

Not run directly - see town_assets.py / town_render.py.
"""
import math

import bpy  # noqa: F401  (import before mathutils when bpy is a module)
from mathutils import Vector, Euler

import prop_lib as L
from prop_lib import C, flat, snowy, tonal, box, cyl, sphere, blob, log, extrude, hexmix
import prop_assets as PA
import life_assets as LA
import bld_assets as BA

FACE_RZ = {'y-': 0.0, 'x+': 90.0, 'y+': 180.0, 'x-': -90.0}
CAM_PSI = 45.0                      # heading (deg) that faces the camera: facing_dir(45) = (+0.71, -0.71)

GLOW = '#FFE2A0'
WHITE = '#F4F1EA'
TRIM_WHITE = '#F2EEE6'
INK = '#2B2F3A'


# =========================================================================== small utils

def face_group(objs, face, loc, name='fg'):
    """Group face-frame objects and place them on a wall (see module doc)."""
    return L.group(BA.top_level(objs), name, loc=loc, rot=(0, 0, FACE_RZ[face]))


def collect_group(fn, name='cg', loc=(0, 0, 0), rot=(0, 0, 0), scale=1.0):
    """Run fn() inside a Collect block and group what it made (move / rotate / scale a sub-assembly)."""
    with L.Collect() as c:
        fn()
    g = L.group(BA.top_level(c.objs), name, loc=loc, rot=rot)
    if scale != 1.0:
        g.scale = (scale, scale, scale) if isinstance(scale, (int, float)) else scale
    return g


def plaster(col, var=0.05, scale=5.0):
    return tonal(col, var, scale, rough=0.86)


def glow_mat(name='glow', strength=1.7, col=GLOW):
    return L.emissive(name, col, 'window', strength)


def ring_seg(mb, center, r, rr, mat, axis='y', a0=0.0, a1=math.tau, n=16, segs=8):
    """Torus-like ring made of tube segments (handles, hoops) into a MB batcher."""
    c = Vector(center)
    pts = []
    for k in range(n + 1):
        a = a0 + (a1 - a0) * k / n
        if axis == 'y':          # ring in the XZ plane
            pts.append(c + Vector((r * math.cos(a), 0.0, r * math.sin(a))))
        elif axis == 'z':        # ring in the XY plane
            pts.append(c + Vector((r * math.cos(a), r * math.sin(a), 0.0)))
        else:                    # ring in the YZ plane
            pts.append(c + Vector((0.0, r * math.cos(a), r * math.sin(a))))
    for p, q in zip(pts, pts[1:]):
        mb.seg(p, q, rr, mat, segs=segs)


def ext_xz(name, pts, t, mat, side=None, y=0.0, bevel=0.02):
    """Extrude a 2D outline drawn in the XZ plane (x right, z up) toward -Y by t; the back face sits at y."""
    o = extrude(name, pts, t, rot=(90, 0, 0), top=mat, side=side or mat, bevel=bevel)
    o.location.y = y
    return o


def circle_pts(r, n=32, cx=0.0, cz=0.0, a0=0.0):
    return [(cx + r * math.cos(a0 + math.tau * k / n), cz + r * math.sin(a0 + math.tau * k / n)) for k in range(n)]


def star_pts(r1, r2, n=5, a0=math.pi / 2):
    out = []
    for k in range(2 * n):
        r = r1 if k % 2 == 0 else r2
        a = a0 + math.pi * k / n
        out.append((r * math.cos(a), r * math.sin(a)))
    return out


def heart_pts(s=1.0, n=40):
    out = []
    for k in range(n):
        t = math.tau * k / n
        x = 16 * math.sin(t) ** 3
        y = 13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t)
        out.append((x / 17.0 * s, y / 17.0 * s))
    # remove the duplicate point at the bottom tip if any
    ded = []
    for p in out:
        if not ded or abs(p[0] - ded[-1][0]) + abs(p[1] - ded[-1][1]) > 1e-4:
            ded.append(p)
    return ded


def rounded_rect_pts(w, h, r, n=5, cx=0.0, cz=0.0):
    pts = []
    for (sx, sz, a0) in ((1, 1, 0.0), (-1, 1, math.pi / 2), (-1, -1, math.pi), (1, -1, 1.5 * math.pi)):
        ccx, ccz = cx + sx * (w / 2 - r), cz + sz * (h / 2 - r)
        for k in range(n + 1):
            a = a0 + (math.pi / 2) * k / n
            pts.append((ccx + r * math.cos(a), ccz + r * math.sin(a)))
    return pts


# =========================================================================== building shells

def block(name, W, D, H, z0=0.0, mat=None, x=0.0, y=0.0, bevel=0.05):
    return box(name, (W, D, H), (x, y, z0), mat=mat, bevel=bevel)


def corner_trims(name, W, D, z0, H, col, t=0.16, x=0.0, y=0.0, faces=('fl', 'fr', 'br', 'bl')):
    m = flat(col, 0.8)
    pos = {'fl': (-W / 2, -D / 2), 'fr': (W / 2, -D / 2), 'br': (W / 2, D / 2), 'bl': (-W / 2, D / 2)}
    return [box(name, (t, t, H), (x + pos[k][0], y + pos[k][1], z0), mat=m, bevel=0.03) for k in faces]


def band(name, W, D, z, col, h=0.1, out=0.05, x=0.0, y=0.0, snow=False, seed=0):
    """Horizontal trim band / cornice ring around a W x D block at height z (bottom of the band)."""
    objs = [box(name, (W + 2 * out, D + 2 * out, h), (x, y, z), mat=flat(col, 0.75), bevel=min(0.03, h * 0.4))]
    if snow:
        objs.append(L.snow_slab(name + '_s', W + 2 * out - 0.04, 0.12, 0.04, (x, y - D / 2 - out + 0.06, z + h),
                                seed=seed))
        objs.append(L.snow_slab(name + '_s2', 0.12, D + 2 * out - 0.04, 0.04, (x + W / 2 + out - 0.06, y, z + h),
                                seed=seed + 1))
    return objs


def plinth(name, W, D, h=0.3, col='#8E96A3', x=0.0, y=0.0, out=0.06):
    return box(name, (W + 2 * out, D + 2 * out, h), (x, y, 0.0), mat=snowy(col, lo=0.75, hi=0.9), bevel=0.04)


def flat_roof(name, W, D, z, col='#8E96A3', parapet=0.28, t=0.16, x=0.0, y=0.0, seed=0, snow=True,
              cap_col=None):
    """Flat roof slab with a parapet ring, snow inside and little snow caps on the parapet."""
    objs = [box(name, (W, D, t), (x, y, z), mat=flat('#6E7480', 0.85), bevel=0.02)]
    pm = flat(col, 0.8)
    cm = snowy(cap_col or col, lo=0.6, hi=0.8)
    pt = 0.16
    for sx, sy, sz, cx, cy in ((W + 0.12, pt, parapet, 0, -D / 2), (W + 0.12, pt, parapet, 0, D / 2),
                               (pt, D, parapet, -W / 2, 0), (pt, D, parapet, W / 2, 0)):
        objs.append(box(name + '_p', (sx, sy, sz), (x + cx, y + cy, z), mat=pm, bevel=0.03))
        objs.append(box(name + '_c', (sx + 0.06, sy + 0.08, 0.07), (x + cx, y + cy, z + parapet), mat=cm,
                        bevel=0.03))
    if snow:
        objs.append(L.snow_slab(name + '_snow', W - 0.3, D - 0.3, 0.14, (x, y, z + t - 0.02), seed=seed))
    return objs


def gable(name, W, D, eave_z, ridge_z, over, roof_col, gable_col, seed=0, x=0.0, y=0.0, along='x',
          snow_frac=(0.6, 0.64), ridge_col=None, gable_thick=0.1):
    """Gable roof + the two triangular end walls.  along='x': ridge along X (slopes face -Y / +Y);
    along='y': ridge along Y (gable end faces the front, like house_c)."""
    roofm = L.stripes(roof_col, hexmix(roof_col, '#000000', 0.12), 4.5, 'Y', rough=0.75, soft=0.04)
    gm = gable_col if not isinstance(gable_col, str) else plaster(gable_col)
    rc = ridge_col or hexmix(roof_col, '#000000', 0.3)
    with L.Collect() as c:
        if along == 'x':
            BA.gable_roof(name, W + 2 * over, D, eave_z, ridge_z, over, roofm, snow_frac=snow_frac, seed=seed,
                          ridge_col=rc)
            for s in (-1, 1):
                BA.gable_end(name + '_g', D + 0.04, eave_z - 0.02, ridge_z, s * (W / 2 + 0.01), gm, thick=gable_thick)
        else:
            with L.Collect() as rc_:
                BA.gable_roof(name, D + 2 * over, W, eave_z, ridge_z, over, roofm, snow_frac=snow_frac, seed=seed,
                              ridge_col=rc)
            BA.regroup(rc_.objs, name + '_rg', rot=(0, 0, 90))
            for s in (-1, 1):
                g = extrude(name + '_g', [(-W / 2 - 0.03, 0.0), (W / 2 + 0.03, 0.0), (0.0, ridge_z - eave_z)],
                            gable_thick, rot=(90, 0, 0), top=gm, side=gm, bevel=0.02)
                g.location = (0, s * (D / 2) + (gable_thick if s < 0 else 0.0), eave_z - 0.02)
    objs = c.objs
    if x or y:
        for o in BA.top_level(objs):
            o.location.x += x
            o.location.y += y
    return objs


def hip_cap(name, W, D, z, h, col, seed=0, x=0.0, y=0.0, snow=True):
    """Pyramid / hip roof (towers, kiosks, cupolas): a tapered box with snow on top."""
    rm = L.stripes(col, hexmix(col, '#000000', 0.12), 5.0, 'Z', rough=0.75, soft=0.04)
    objs = [box(name, (W, D, h), (x, y, z), mat=rm, bevel=0.03, taper=(0.06, 0.06))]
    if snow:
        objs.append(blob(name + '_s', min(W, D) * 0.32, (x, y, z + h * 0.62), flat('snow_mat', 0.9),
                         scale=(W / min(W, D), D / min(W, D), 0.75), seed=seed, amp=0.1, subdiv=2))
    return objs


def chimney(name, x, y, z0, z1, col='#B4593F', w=0.36):
    sm = L.brick(col, hexmix(col, '#000000', 0.15), '#D9CFC2', scale=3.0, row_h=0.42, snow_top=False)
    objs = [box(name, (w, w, z1 - z0), (x, y, z0), mat=sm, bevel=0.03),
            box(name + '_cap', (w + 0.1, w + 0.1, 0.08), (x, y, z1), mat=snowy('#6E6A68', lo=0.7, hi=0.9),
                bevel=0.02),
            box(name + '_hole', (w * 0.6, w * 0.6, 0.02), (x, y, z1 + 0.08), mat=flat('#241C18', 0.9), bevel=0.0)]
    return objs, (x, y, z1 + 0.25)


# =========================================================================== doors / windows

def door(name, loc, face='y-', w=0.78, h=1.42, col='#3D7CC9', frame_col=TRIM_WHITE, glass=True, double=False,
         step=True, knob='gold', arch=False, canopy=None, canopy_col='#C0473A', step_col='stone', step_depth=0.42,
         wreath=False):
    """Front door unit on a wall (loc = bottom-centre ON the wall surface).  Returns the group."""
    fm = flat(frame_col, 0.75)
    dm = L.stripes(col, hexmix(col, '#000000', 0.1), 5.0 / w, 'X', rough=0.7, soft=0.05)
    objs = []
    if arch:
        pts = PA.arch_pts(w + 0.2, h + 0.12, 12)
        objs.append(ext_xz(name + '_fr', pts, 0.08, fm, y=0.0))
        objs[-1].location.x = 0.0
        d = ext_xz(name + '_leaf', PA.arch_pts(w, h, 12), 0.1, dm, y=0.02)
        objs.append(d)
    else:
        objs.append(box(name + '_fr', (w + 0.2, 0.1, h + 0.1), (0, -0.02, 0.0), mat=fm, bevel=0.03))
        if double:
            for s in (-1, 1):
                objs.append(box(name + '_leaf', (w / 2 - 0.02, 0.1, h), (s * w / 4, -0.06, 0.0), mat=dm, bevel=0.02))
        else:
            objs.append(box(name + '_leaf', (w, 0.1, h), (0, -0.06, 0.0), mat=dm, bevel=0.02))
    if glass:
        gm = glow_mat(name + '_g', 1.6)
        if double:
            for s in (-1, 1):
                objs.append(box(name + '_gl', (w / 2 - 0.2, 0.04, h * 0.42), (s * w / 4, -0.12, h * 0.45), mat=gm,
                                bevel=0.015))
        else:
            gw = w * 0.56
            if arch:
                objs.append(cyl(name + '_gl', gw / 2, 0.04, (0, -0.12, h - w * 0.5), rot=(90, 0, 0), mat=gm, segs=20,
                                origin='center'))
            else:
                objs.append(box(name + '_gl', (gw, 0.04, h * 0.36), (0, -0.12, h * 0.52), mat=gm, bevel=0.015))
    kx = w * 0.33 if not double else 0.08
    objs.append(sphere(name + '_knob', 0.045, (kx, -0.14, h * 0.48), flat(knob, 0.3, 0.8), segs=10, rings=6))
    if double:
        objs.append(sphere(name + '_knob2', 0.045, (-kx, -0.14, h * 0.48), flat(knob, 0.3, 0.8), segs=10, rings=6))
    if step:
        objs.append(box(name + '_step', (w + 0.4, step_depth, 0.1), (0, -step_depth / 2 - 0.02, -0.01),
                        mat=snowy(step_col, lo=0.6, hi=0.8), bevel=0.04))
    if wreath:
        objs.append(BA.wreath(name + '_wr', (0, -0.13, h * 0.78), r=0.11))
    if canopy:
        cd, cz = canopy if isinstance(canopy, tuple) else (0.55, h + 0.28)
        rm = L.stripes(canopy_col, hexmix(canopy_col, '#000000', 0.12), 5.0, 'Y', rough=0.75, soft=0.04)
        with L.Collect() as cc:
            LA.roof(name + '_can', w + 0.55, -cd, cz - 0.16, 0.0, cz + 0.12, 0.06, rm, snow_frac=0.85, seed=7)
            for s in (-1, 1):
                box(name + '_br', (0.05, cd * 0.8, 0.05), (s * (w / 2 + 0.12), -cd * 0.4, cz - 0.22), rot=(-28, 0, 0),
                    mat=fm, bevel=0.0)
        objs += cc.objs
    return face_group(objs, face, loc, name)


def win(name, loc, face='y-', w=0.56, h=0.6, shutters=None, frame=TRIM_WHITE, glow=1.8, round_=False, cross=True,
        seed=0):
    """Thin wrapper around bld_assets.window (loc = TOP-centre of the glass on the wall surface)."""
    return BA.window(name, loc, face, w=w, h=h, glow=glow, shutters=shutters, frame=frame, sill_snow=True,
                     cross=cross, seed=seed, round_=round_)


def win_row(name, face, z_top, xs, wall_coord, w=0.56, h=0.6, shutters=None, frame=TRIM_WHITE, seed=0, along=0.0):
    """A row of windows; face 'y-' -> xs are x positions at y = wall_coord; 'x+' -> xs are y positions."""
    out = []
    for k, a in enumerate(xs):
        if face == 'y-':
            loc = (a, wall_coord, z_top)
        elif face == 'x+':
            loc = (wall_coord, a, z_top)
        elif face == 'y+':
            loc = (a, wall_coord, z_top)
        else:
            loc = (wall_coord, a, z_top)
        out.append(win('%s%d' % (name, k), loc, face, w=w, h=h, shutters=shutters, frame=frame, seed=seed + k))
    return out


def shop_window(name, loc, face='y-', w=1.2, h=0.95, frame_col=TRIM_WHITE, display=None, glow=1.45, sill_col=None,
                mullions=1, depth=0.22, back_col=GLOW):
    """Protruding lit display window (loc = bottom-centre on the wall surface; z = sill height).
    display(objs) may add goods in the face frame: x in [-w/2, w/2], y in [-depth+0.03, -0.04], z in [0, h]."""
    fm = flat(frame_col, 0.72)
    objs = [box(name + '_back', (w, 0.04, h), (0, -0.02, 0.0), mat=glow_mat(name + '_bk', glow, back_col),
                bevel=0.0)]
    t = 0.1
    objs.append(box(name + '_top', (w + 2 * t, depth, t), (0, -depth / 2, h), mat=fm, bevel=0.025))
    objs.append(box(name + '_bot', (w + 2 * t, depth + 0.06, t), (0, -depth / 2 - 0.03, -t), mat=flat(sill_col or
                                                                                                        frame_col, 0.72),
                    bevel=0.025))
    for s in (-1, 1):
        objs.append(box(name + '_side', (t, depth, h), (s * (w / 2 + t / 2), -depth / 2, 0.0), mat=fm, bevel=0.02))
    for k in range(1, mullions + 1):
        x = -w / 2 + w * k / (mullions + 1)
        objs.append(box(name + '_mul', (0.05, 0.05, h), (x, -depth + 0.03, 0.0), mat=fm, bevel=0.01))
    # faint glass sheen strip
    gl = flat('#CFE6F5', 0.08, 0.0)
    objs.append(box(name + '_sheen', (0.05, 0.01, h * 0.7), (-w * 0.32, -depth + 0.02, h * 0.15), rot=(0, -25, 0),
                    mat=gl, bevel=0.0))
    objs.append(L.snow_slab(name + '_snow', w + 0.18, depth - 0.02, 0.06, (0, -depth / 2, h + t), seed=3))
    if display:
        display(objs)
    return face_group(objs, face, loc, name)


def awning_on(face, W, y_wall, z_back, z_front, depth, c1, c2='cream', stripes_n=8, x=0.0, name='awning'):
    """bld/props striped awning (PA.awning) on a face: 'y-' wall at y = y_wall; 'x+' wall at x = y_wall (W runs
    along Y, centred on x)."""
    with L.Collect() as c:
        PA.awning(W, depth, z_back, z_front, -abs(y_wall), -abs(y_wall) - depth, c1, c2, stripes_n, name=name, x=x)
    if face == 'x+':
        BA.regroup(c.objs, name + '_r', rot=(0, 0, 90))
    return c.objs


def lamp_wall(name, loc, face='y-', strength=3.0):
    with L.Collect() as c:
        PA.lantern(name, (0, -0.24, -0.1), 0.13, strength)
        box(name + '_arm', (0.04, 0.26, 0.04), (0, -0.12, 0.2), mat=flat('#3D424C', 0.5, 0.5), bevel=0.0)
    return face_group(c.objs, face, loc, name)


# =========================================================================== signs + emblems

def sign_disc(name, center, r=0.42, bg='#3E8E57', rim='#F2C14E', psi=CAM_PSI, tilt=10.0, emblem=None, es=1.0,
              t=0.08, snow=True, back=None):
    """Round sign board facing heading psi (45 = the camera), tilted back by `tilt` deg, with an emblem built in
    the sign frame (emblem(scale) -> objs, picture ~0.8 m wide at scale 1) placed in front of the board."""
    objs = [cyl(name + '_board', r, t, (0, 0, 0), rot=(90, 0, 0), mat=flat(bg, 0.6), segs=40, origin='center',
                bevel=0.02, cap_mat=flat(hexmix(bg, '#FFFFFF', 0.12), 0.6)),
            cyl(name + '_rim', r + 0.05, t * 0.7, (0, 0.012, 0), rot=(90, 0, 0), mat=flat(rim, 0.35, 0.6), segs=40,
                origin='center', bevel=0.015)]
    if back:
        objs.append(cyl(name + '_back', r + 0.04, 0.02, (0, t / 2 + 0.02, 0), rot=(90, 0, 0), mat=flat(back, 0.7),
                        segs=40, origin='center', bevel=0.0))
    if snow:
        objs.append(L.snow_slab(name + '_snow', r * 1.1, t + 0.06, 0.05, (0, 0.0, r + 0.02), seed=5))
    if emblem:
        with L.Collect() as ec:
            emblem(es)
        g = L.group(BA.top_level(ec.objs), name + '_em', loc=(0, -t / 2 - 0.01, 0))
        objs.append(g)
    return L.group(objs, name, loc=center, rot=(-tilt, 0, psi))


def emblem_at(name, emblem, center, psi=CAM_PSI, scale=1.0, tilt=0.0):
    """A free-standing 3D emblem (rooftop icon) placed at center, facing heading psi."""
    with L.Collect() as ec:
        emblem(scale)
    return L.group(BA.top_level(ec.objs), name, loc=center, rot=(-tilt, 0, psi))


def bracket_sign(name, corner, out_dir=(1.0, -1.0), z=2.3, arm=0.5, **kw):
    """Wrought-iron bracket sticking out of a building corner toward out_dir, with a sign_disc hanging under it."""
    iron = flat('#3D424C', 0.45, 0.6)
    d = Vector((out_dir[0], out_dir[1], 0.0)).normalized()
    p0 = Vector((corner[0], corner[1], z))
    p1 = p0 + d * arm
    mb = L.MB()
    mb.seg(p0, p1, 0.035, iron, segs=8)
    mb.seg(p0 + Vector((0, 0, -0.32)), p0 + d * arm * 0.6, 0.025, iron, segs=8)
    mb.sphere(0.06, iron, loc=tuple(p1), segs=10, rings=6)
    objs = [mb.done(name + '_arm')]
    r = kw.get('r', 0.42)
    c = p1 + Vector((0, 0, -r - 0.12))
    side = Vector((math.cos(math.radians(kw.get('psi', CAM_PSI))), math.sin(math.radians(kw.get('psi', CAM_PSI))), 0))
    mb2 = L.MB()
    for s in (-0.5, 0.5):
        a = p1 + side * s * r * 0.9
        mb2.seg(Vector((a.x, a.y, p1.z)), Vector((a.x, a.y, c.z + r * 0.85)), 0.012, flat('#3D424C', 0.45, 0.6), segs=5)
    objs.append(mb2.done(name + '_chains'))
    kw.setdefault('tilt', 0.0)
    objs.append(sign_disc(name + '_disc', tuple(c), **kw))
    return objs


def post_sign(name, base, h=2.2, post_col='#3D424C', **kw):
    """Free-standing sign: a post with a sign_disc on top (yard gates, stop signs)."""
    r = kw.get('r', 0.42)
    objs = [cyl(name + '_post', 0.05, h - r, base, mat=flat(post_col, 0.45, 0.5), segs=12, bevel=0.01),
            cyl(name + '_foot', 0.14, 0.1, base, mat=snowy('stone', lo=0.6, hi=0.8), segs=14, r_top=0.1)]
    kw.setdefault('tilt', 8.0)
    objs.append(sign_disc(name + '_disc', (base[0], base[1], base[2] + h - r * 0.2), **kw))
    return objs


# ---------------------------------------------------------------- emblem builders (sign frame, ~0.8 m wide at s=1)

def em_coffee(s=1.0, cup='#F4F1EA', band_col='#3FA58C', steam=True):
    c = flat(cup, 0.35)
    objs = [cyl('cup', 0.2 * s, 0.32 * s, (0, -0.1 * s, -0.24 * s), mat=c, r_top=0.26 * s, segs=32, bevel=0.03 * s),
            cyl('cupband', 0.232 * s, 0.07 * s, (0, -0.1 * s, -0.1 * s), mat=flat(band_col, 0.5), r_top=0.243 * s,
                segs=32, bevel=0.01 * s),
            cyl('coffee', 0.235 * s, 0.02 * s, (0, -0.1 * s, 0.04 * s), mat=flat('#6B3E26', 0.3), segs=32,
                bevel=0.005 * s),
            cyl('saucer', 0.36 * s, 0.05 * s, (0, -0.1 * s, -0.27 * s), mat=c, r_top=0.4 * s, segs=36, bevel=0.02 * s),
            cyl('saucerrim', 0.4 * s, 0.015 * s, (0, -0.1 * s, -0.226 * s), mat=flat(band_col, 0.5), segs=36,
                bevel=0.005 * s)]
    hm = flat(cup, 0.35)
    mb = L.MB()
    ring_seg(mb, (0.27 * s, -0.1 * s, -0.08 * s), 0.1 * s, 0.03 * s, hm, axis='y', a0=-1.6, a1=1.6, n=10)
    objs.append(mb.done('handle'))
    # latte heart
    hp = heart_pts(0.07 * s)
    lh = extrude('latte', hp, 0.01 * s, top=flat('#F2E2C4', 0.4), side=flat('#F2E2C4', 0.4), bevel=0.0)
    lh.location = (0, -0.1 * s, 0.055 * s)
    objs.append(lh)
    if steam:
        sm = flat('#FFFFFF', 0.6)
        for k, x in enumerate((-0.09, 0.08)):
            pts = [(x * s + 0.05 * s * math.sin(t * 2.6 + k), -0.1 * s, (0.1 + 0.32 * t) * s) for t in
                   [i / 6 for i in range(7)]]
            objs.append(L.smooth_tube('steam', pts, 0.022 * s, sm))
    return objs


def em_scissors(s=1.0, handle='#D9483B'):
    steel = flat('#DCE4EE', 0.22, 0.75)
    objs = []
    blade = [(0.0, 0.0), (0.05, 0.02), (0.08, 0.4), (0.03, 0.5), (-0.02, 0.06)]
    for k, ang in enumerate((-22, 22)):
        b = ext_xz('blade%d' % k, [(x * s, z * s) for x, z in blade], 0.04 * s, steel, y=-0.03 * s * k, bevel=0.01 * s)
        g = L.group([b], 'bl%d' % k, loc=(0, 0, -0.08 * s), rot=(0, ang, 0))
        objs.append(g)
        mb = L.MB()
        a = math.radians(ang)
        hx, hz = -math.sin(a) * -0.22 * s, -0.08 * s - math.cos(a) * 0.22 * s
        ring_seg(mb, (hx * 1.1 + (0.02 if k else -0.02) * s, -0.04 * s, hz), 0.1 * s, 0.035 * s, flat(handle, 0.45),
                 axis='y', n=18)
        mb.seg(Vector((0, -0.04 * s, -0.08 * s)), Vector((hx * 0.6, -0.04 * s, hz + 0.08 * s)), 0.03 * s,
               flat(handle, 0.45), segs=8)
        objs.append(mb.done('handle%d' % k))
    objs.append(cyl('pivot', 0.035 * s, 0.1 * s, (0, -0.02 * s, -0.08 * s), rot=(90, 0, 0), mat=flat('gold', 0.3, 0.8),
                    segs=12, origin='center'))
    return objs


def em_comb(s=1.0, col='#3D7CC9'):
    m = flat(col, 0.45)
    pts = [(-0.3, 0.0), (0.3, 0.0), (0.3, 0.07), (-0.3, 0.07)]
    objs = [ext_xz('combback', [(x * s, z * s) for x, z in pts], 0.03 * s, m, bevel=0.01 * s)]
    for k in range(12):
        x = (-0.27 + 0.049 * k) * s
        objs.append(box('tooth', (0.022 * s, 0.03 * s, 0.13 * s), (x, -0.015 * s, -0.12 * s), mat=m, bevel=0.006 * s))
    return objs


def em_flower(s=1.0, petal='#F28DB2', center='#F2C14E', n=6, stem=True):
    pm = flat(petal, 0.55)
    objs = [sphere('fcenter', 0.11 * s, (0, -0.06 * s, 0.08 * s), flat(center, 0.6), scale=(1, 0.7, 1), segs=18,
                   rings=10)]
    for k in range(n):
        a = math.tau * k / n + 0.3
        objs.append(sphere('petal', 0.13 * s, (0.19 * s * math.cos(a), -0.03 * s, 0.08 * s + 0.19 * s * math.sin(a)),
                           pm, scale=(1.0, 0.45, 0.7), rot=(0, -math.degrees(a), 0), segs=16, rings=10))
    if stem:
        gm = flat('#3E9A5A', 0.6)
        objs.append(L.smooth_tube('stem', [(0, -0.02 * s, -0.04 * s), (0.03 * s, -0.02 * s, -0.25 * s),
                                           (0.0, -0.02 * s, -0.42 * s)], 0.03 * s, gm))
        for sx in (-1, 1):
            objs.append(sphere('leaf', 0.09 * s, (sx * 0.1 * s, -0.03 * s, -0.27 * s), gm, scale=(1.0, 0.35, 0.45),
                               rot=(0, sx * 30, 0), segs=12, rings=8))
    return objs


def em_tulip(s=1.0, col='#E8524A'):
    pm = flat(col, 0.5)
    objs = []
    for k, x in enumerate((-0.07, 0.0, 0.07)):
        objs.append(sphere('tp', 0.11 * s, (x * s, -0.04 * s - 0.02 * s * (k == 1), 0.12 * s + 0.03 * s * (k == 1)),
                           pm, scale=(0.75, 0.7, 1.25), segs=16, rings=10))
    gm = flat('#3E9A5A', 0.6)
    objs.append(cyl('ts', 0.025 * s, 0.4 * s, (0, -0.02 * s, -0.32 * s), mat=gm, segs=8))
    for sx in (-1, 1):
        objs.append(sphere('tl', 0.1 * s, (sx * 0.08 * s, -0.03 * s, -0.18 * s), gm, scale=(0.5, 0.3, 1.3),
                           rot=(0, sx * 25, 0), segs=12, rings=8))
    return objs


def em_book(s=1.0, cover='#C0473A', pages='#FBF6EA'):
    objs = []
    pm = flat(pages, 0.7)
    cm = flat(cover, 0.6)
    lm = flat('#9AA3B0', 0.7)
    for sx in (-1, 1):
        g = []
        g.append(box('cover', (0.36 * s, 0.03 * s, 0.46 * s), (sx * 0.18 * s, 0.0, -0.23 * s), mat=cm, bevel=0.01 * s))
        g.append(box('pages', (0.33 * s, 0.05 * s, 0.42 * s), (sx * 0.17 * s, -0.035 * s, -0.21 * s), mat=pm,
                     bevel=0.012 * s))
        for k in range(5):
            g.append(box('line', ((0.2 - 0.04 * (k == 4)) * s, 0.01 * s, 0.018 * s),
                         (sx * 0.17 * s, -0.065 * s, (0.12 - 0.07 * k) * s), mat=lm, bevel=0.0))
        grp = L.group(g, 'half', loc=(0, 0, 0), rot=(0, 0, -sx * 14))
        objs.append(grp)
    objs.append(box('ribbon', (0.035 * s, 0.01 * s, 0.25 * s), (0.04 * s, -0.08 * s, -0.42 * s), mat=flat('#F2C14E', 0.5),
                    bevel=0.0))
    objs.append(cyl('spine', 0.03 * s, 0.46 * s, (0, 0.01 * s, -0.23 * s), mat=cm, segs=10))
    return objs


def em_teddy(s=1.0, fur='#B9783F', light='#E9C9A0'):
    fm = tonal(fur, 0.06, 8.0, rough=0.9)
    lm = flat(light, 0.85)
    dk = flat('#2A1E1A', 0.3)
    objs = [sphere('head', 0.27 * s, (0, 0, 0), fm, scale=(1.08, 0.9, 0.95), segs=28, rings=16)]
    for sx in (-1, 1):
        objs.append(sphere('ear', 0.1 * s, (sx * 0.22 * s, 0.02 * s, 0.2 * s), fm, scale=(1, 0.6, 1), segs=16, rings=10))
        objs.append(sphere('earin', 0.06 * s, (sx * 0.22 * s, -0.04 * s, 0.2 * s), lm, scale=(1, 0.4, 1), segs=12,
                           rings=8))
        objs.append(sphere('eye', 0.035 * s, (sx * 0.1 * s, -0.22 * s, 0.05 * s), dk, segs=12, rings=8))
        objs.append(sphere('cheek', 0.04 * s, (sx * 0.17 * s, -0.2 * s, -0.04 * s), flat('#F2A0A0', 0.7),
                           scale=(1, 0.4, 0.7), segs=10, rings=6))
    objs.append(sphere('muzzle', 0.12 * s, (0, -0.21 * s, -0.06 * s), lm, scale=(1.1, 0.7, 0.85), segs=18, rings=10))
    objs.append(sphere('nose', 0.045 * s, (0, -0.29 * s, -0.02 * s), dk, scale=(1.2, 0.8, 0.8), segs=12, rings=8))
    # bow tie
    bm = flat('#D9483B', 0.5)
    for sx in (-1, 1):
        objs.append(sphere('bow', 0.07 * s, (sx * 0.07 * s, -0.12 * s, -0.27 * s), bm, scale=(1.0, 0.5, 0.7), segs=12,
                           rings=8))
    objs.append(sphere('knot', 0.035 * s, (0, -0.15 * s, -0.27 * s), bm, segs=10, rings=6))
    return objs


def em_plate(s=1.0):
    wm = flat('#F7F4EE', 0.35)
    objs = [cyl('plate', 0.3 * s, 0.04 * s, (0, 0, 0), rot=(90, 0, 0), mat=wm, segs=40, origin='center',
                bevel=0.015 * s),
            cyl('platerim', 0.26 * s, 0.045 * s, (0, -0.005 * s, 0), rot=(90, 0, 0), mat=flat('#3D7CC9', 0.45), segs=40,
                origin='center', bevel=0.005 * s),
            cyl('plateinner', 0.23 * s, 0.05 * s, (0, -0.008 * s, 0), rot=(90, 0, 0), mat=wm, segs=40,
                origin='center', bevel=0.005 * s)]
    steel = flat('#DCE4EE', 0.25, 0.75)
    # fork (left)
    f = [(-0.025, -0.4), (0.025, -0.4), (0.03, 0.02), (0.06, 0.08), (0.06, 0.3), (0.04, 0.3), (0.04, 0.12),
         (0.02, 0.12), (0.02, 0.3), (-0.0, 0.3), (-0.0, 0.12), (-0.02, 0.12), (-0.02, 0.3), (-0.04, 0.3),
         (-0.04, 0.12), (-0.06, 0.12), (-0.06, 0.3), (-0.08, 0.3), (-0.08, 0.08), (-0.03, 0.02)]
    fork = ext_xz('fork', [(x * s - 0.0, z * s) for x, z in f], 0.025 * s, steel, y=-0.03 * s, bevel=0.006 * s)
    fork.location.x = -0.4 * s
    objs.append(fork)
    k_ = [(-0.03, -0.4), (0.03, -0.4), (0.035, 0.0), (0.05, 0.08), (0.05, 0.32), (0.0, 0.36), (-0.04, 0.3),
          (-0.03, 0.0)]
    knife = ext_xz('knife', [(x * s, z * s) for x, z in k_], 0.025 * s, steel, y=-0.03 * s, bevel=0.006 * s)
    knife.location.x = 0.4 * s
    objs.append(knife)
    # a bread roll on the plate
    with L.Collect() as bc_:
        PA.bread_model('roll', loc=(0, -0.12 * s, -0.08 * s), rot=(90, 0, 15), scale=0.55 * s)
    objs += BA.top_level(bc_.objs)
    return objs


def em_basket(s=1.0, col='#D9483B'):
    m = flat(col, 0.5)
    objs = [box('bask', (0.6 * s, 0.32 * s, 0.32 * s), (0, 0, -0.32 * s), mat=L.stripes(col, hexmix(col, '#FFFFFF', 0.25),
                                                                                        12.0 / s, 'X', soft=0.02),
                bevel=0.04 * s, taper=(1.18, 1.18)),
            box('baskrim', (0.74 * s, 0.38 * s, 0.05 * s), (0, 0, 0.0), mat=m, bevel=0.02 * s)]
    mb = L.MB()
    ring_seg(mb, (0, 0, 0.02 * s), 0.24 * s, 0.025 * s, flat('#3D424C', 0.45, 0.5), axis='y', a0=0.15, a1=math.pi - 0.15,
             n=14)
    objs.append(mb.done('handle'))
    # goods: apple, bread, leek, bottle
    objs.append(sphere('apple', 0.1 * s, (-0.18 * s, -0.05 * s, 0.06 * s), flat('#D9483B', 0.4), segs=16, rings=10))
    objs.append(cyl('astem', 0.01 * s, 0.05 * s, (-0.18 * s, -0.05 * s, 0.15 * s), mat=flat('#5E3A22', 0.8), segs=6))
    objs.append(sphere('apple2', 0.09 * s, (0.02 * s, -0.08 * s, 0.03 * s), flat('#7DB34A', 0.45), segs=16, rings=10))
    objs.append(cyl('bottle', 0.05 * s, 0.32 * s, (0.2 * s, 0.03 * s, -0.04 * s), rot=(0, -12, 0),
                    mat=flat('#4F86C2', 0.25), segs=14, r_top=0.03 * s))
    objs.append(cyl('leek', 0.035 * s, 0.4 * s, (0.08 * s, 0.05 * s, -0.08 * s), rot=(0, 22, 0),
                    mat=flat('#EEF0E0', 0.6), segs=10))
    objs.append(sphere('leektop', 0.06 * s, (0.17 * s, 0.05 * s, 0.25 * s), flat('#3E9A5A', 0.6), scale=(0.8, 0.8, 1.8),
                       rot=(0, 22, 0), segs=10, rings=8))
    return objs


def em_hammer_wrench(s=1.0):
    wood = tonal('#C98F55', 0.08, 3.0, rough=0.6)
    iron = flat('#7D8794', 0.32, 0.7)
    objs = []
    h = [cyl('hh', 0.04 * s, 0.62 * s, (0, 0, -0.32 * s), mat=wood, segs=12, bevel=0.015 * s),
         box('hhead', (0.32 * s, 0.12 * s, 0.13 * s), (0.04 * s, 0, 0.26 * s), mat=iron, bevel=0.025 * s)]
    objs.append(L.group(h, 'hammer', rot=(0, 32, 0)))
    w = [box('wsh', (0.07 * s, 0.04 * s, 0.5 * s), (0, 0, -0.3 * s), mat=flat('#B9C2CE', 0.3, 0.75), bevel=0.015 * s)]
    jaw = [(-0.11, 0.0), (0.11, 0.0), (0.13, 0.12), (0.06, 0.2), (0.04, 0.1), (-0.04, 0.1), (-0.06, 0.2), (-0.13, 0.12)]
    w.append(ext_xz('wjaw', [(x * s, z * s) for x, z in jaw], 0.04 * s, flat('#B9C2CE', 0.3, 0.75), y=0.02 * s,
                    bevel=0.01 * s))
    w[-1].location.z = 0.17 * s
    objs.append(L.group(w, 'wrench', loc=(0, 0.06 * s, 0), rot=(0, -32, 0)))
    return objs


def em_saw(s=1.0):
    steel = flat('#DCE4EE', 0.22, 0.75)
    pts = [(-0.38, 0.06), (0.18, 0.1), (0.18, -0.12)]
    teeth = []
    n = 12
    for k in range(n + 1):
        x = 0.18 - (0.56 * k / n)
        teeth.append((x, -0.12 + 0.01 * k if k % 2 == 0 else -0.155 + 0.01 * k))
    outline = [(-0.38, 0.06), (0.18, 0.1)] + [(0.18, -0.12)] + teeth[1:] + [(-0.38, -0.0)]
    blade = ext_xz('sawblade', [(x * s, z * s) for x, z in outline], 0.02 * s, steel, bevel=0.004 * s)
    wood = flat('#C0702E', 0.55)
    hp = [(0.14, 0.13), (0.4, 0.15), (0.42, -0.18), (0.14, -0.15)]
    handle = ext_xz('sawhandle', [(x * s, z * s) for x, z in hp], 0.07 * s, wood, y=0.025 * s, bevel=0.02 * s)
    hole = ext_xz('sawhole', [(x * s, z * s) for x, z in rounded_rect_pts(0.12, 0.16, 0.05, 4, 0.3, 0.0)], 0.02 * s,
                  flat('#5E3A22', 0.8), y=-0.045 * s, bevel=0.0)
    return [L.group([blade, handle, hole], 'saw', loc=(0.02 * s, 0, 0), rot=(0, -12, 0))]


def em_envelope(s=1.0):
    pm = flat('#FBF6EA', 0.7)
    objs = [box('env', (0.62 * s, 0.05 * s, 0.4 * s), (0, 0, -0.2 * s), mat=pm, bevel=0.02 * s)]
    fl = ext_xz('flap', [(-0.3 * s, 0.19 * s), (0.3 * s, 0.19 * s), (0.0, -0.04 * s)], 0.02 * s, flat('#EDE3CC', 0.7),
                y=-0.025 * s, bevel=0.006 * s)
    objs.append(fl)
    objs.append(cyl('seal', 0.06 * s, 0.03 * s, (0, -0.05 * s, -0.03 * s), rot=(90, 0, 0), mat=flat('#D9483B', 0.4),
                    segs=20, origin='center', bevel=0.008 * s))
    objs.append(box('stamp', (0.12 * s, 0.02 * s, 0.13 * s), (0.22 * s, -0.03 * s, -0.17 * s), mat=flat('#3D7CC9', 0.6),
                    bevel=0.008 * s))
    return objs


def em_heart_plus(s=1.0, col='#E8524A'):
    hm = flat(col, 0.4)
    h = ext_xz('heart', [(x, z - 0.02 * s) for x, z in heart_pts(0.36 * s)], 0.1 * s, hm, bevel=0.035 * s)
    wm = flat('#FFFFFF', 0.4)
    p = [box('plv', (0.08 * s, 0.05 * s, 0.26 * s), (0, -0.12 * s, -0.12 * s), mat=wm, bevel=0.015 * s),
         box('plh', (0.26 * s, 0.05 * s, 0.08 * s), (0, -0.12 * s, -0.04 * s), mat=wm, bevel=0.015 * s)]
    return [h] + p


def em_star(s=1.0, col='#F2C14E', shield='#2E4F8A'):
    objs = [ext_xz('shield', [(x * s, z * s) for x, z in [(-0.3, 0.3), (0.3, 0.3), (0.3, -0.05), (0.0, -0.38),
                                                          (-0.3, -0.05)]], 0.05 * s, flat(shield, 0.5),
                   bevel=0.02 * s)]
    st = ext_xz('star', [(x, z) for x, z in star_pts(0.24 * s, 0.1 * s)], 0.06 * s, flat(col, 0.3, 0.7), y=-0.04 * s,
                bevel=0.015 * s)
    objs.append(st)
    return objs


def em_helmet(s=1.0, col='#D9483B'):
    rm = flat(col, 0.35)
    objs = [sphere('dome', 0.25 * s, (0, 0.04 * s, -0.02 * s), rm, scale=(1.0, 1.1, 0.95), segs=28, rings=14),
            cyl('brim', 0.36 * s, 0.04 * s, (0, 0.04 * s, -0.08 * s), mat=rm, segs=32, bevel=0.015 * s,
                scale=(1.0, 1.25, 1.0)),
            box('crest', (0.05 * s, 0.4 * s, 0.07 * s), (0, 0.04 * s, 0.2 * s), mat=rm, bevel=0.02 * s)]
    sh = ext_xz('hshield', [(x * s, z * s) for x, z in [(-0.12, 0.12), (0.12, 0.12), (0.13, -0.04), (0.0, -0.14),
                                                        (-0.13, -0.04)]], 0.03 * s, flat('#F2C14E', 0.3, 0.7),
                y=-0.24 * s, bevel=0.01 * s)
    sh.location.z = 0.06 * s
    objs.append(sh)
    return objs


def em_tshirt(s=1.0, col='#E8749A'):
    pts = [(-0.12, 0.25), (-0.3, 0.17), (-0.38, 0.0), (-0.24, -0.06), (-0.2, 0.06), (-0.2, -0.32), (0.2, -0.32),
           (0.2, 0.06), (0.24, -0.06), (0.38, 0.0), (0.3, 0.17), (0.12, 0.25), (0.06, 0.2), (0.0, 0.18),
           (-0.06, 0.2)]
    m = flat(col, 0.7)
    objs = [ext_xz('tee', [(x * s, z * s) for x, z in pts], 0.06 * s, m, bevel=0.02 * s)]
    objs.append(box('stripe', (0.42 * s, 0.02 * s, 0.07 * s), (0, -0.065 * s, -0.08 * s), mat=flat('#FFFFFF', 0.6),
                    bevel=0.005 * s))
    iron = flat('#3D424C', 0.45, 0.6)
    mb = L.MB()
    mb.seg(Vector((-0.3 * s, 0.02 * s, 0.17 * s)), Vector((0.0, 0.02 * s, 0.32 * s)), 0.015 * s, iron)
    mb.seg(Vector((0.3 * s, 0.02 * s, 0.17 * s)), Vector((0.0, 0.02 * s, 0.32 * s)), 0.015 * s, iron)
    ring_seg(mb, (0.0, 0.02 * s, 0.4 * s), 0.06 * s, 0.014 * s, iron, axis='y', a0=-1.5, a1=3.2, n=10)
    objs.append(mb.done('hanger'))
    return objs


def em_clock(s=1.0, face='#FBF6EA', rim='#F2C14E', hh=-60.0, mm=60.0):
    objs = [cyl('dial', 0.3 * s, 0.05 * s, (0, 0, 0), rot=(90, 0, 0), mat=flat(face, 0.5), segs=40, origin='center',
                bevel=0.01 * s),
            cyl('drim', 0.34 * s, 0.04 * s, (0, 0.01 * s, 0), rot=(90, 0, 0), mat=flat(rim, 0.35, 0.6), segs=40,
                origin='center', bevel=0.012 * s)]
    dk = flat(INK, 0.4)
    for k in range(12):
        a = math.tau * k / 12
        objs.append(box('tick', (0.025 * s, 0.01 * s, (0.06 if k % 3 == 0 else 0.035) * s),
                        (0.24 * s * math.sin(a), -0.03 * s, 0.24 * s * math.cos(a) - 0.02 * s), rot=(0, math.degrees(a), 0),
                        mat=dk, bevel=0.0))
    for ang, ln, w in ((hh, 0.15, 0.035), (mm, 0.22, 0.025)):
        objs.append(box('hand', (w * s, 0.01 * s, ln * s), (0, -0.04 * s, 0), rot=(0, ang, 0), mat=dk, bevel=0.0))
    objs.append(cyl('hub', 0.025 * s, 0.03 * s, (0, -0.04 * s, 0), rot=(90, 0, 0), mat=flat(rim, 0.35, 0.6), segs=12,
                    origin='center'))
    return objs


def bell_model(name, s=1.0, col='#E2B33C'):
    """Bell hanging from its top at the origin (opening down), clapper inside."""
    gm = flat(col, 0.28, 0.85)

    def prof(j, k):
        M = 28
        th = math.tau * j / M
        rows = [(0.06, 0.0), (0.12, -0.04), (0.14, -0.12), (0.16, -0.22), (0.22, -0.3), (0.26, -0.33), (0.25, -0.36)]
        r, z = rows[k]
        return (r * s * math.cos(th), r * s * math.sin(th), z * s)
    b = L.revolve(name, prof, 28, 7, mat=gm, top=(0, 0, 0.0))
    objs = [b, cyl(name + '_crown', 0.04 * s, 0.08 * s, (0, 0, 0), mat=gm, segs=10),
            sphere(name + '_clap', 0.05 * s, (0, 0, -0.33 * s), flat('#5E4A3A', 0.4, 0.6), segs=10, rings=6)]
    return objs


def em_pencil_apple(s=1.0):
    objs = []
    y = flat('#F2C14E', 0.5)
    pen = [cyl('pbody', 0.06 * s, 0.5 * s, (0, 0, -0.25 * s), mat=y, segs=6, bevel=0.005 * s),
           cyl('ptip', 0.06 * s, 0.13 * s, (0, 0, -0.38 * s), rot=(180, 0, 0), mat=flat('#E9C9A0', 0.7), segs=6,
               r_top=0.0, bevel=0.0),
           cyl('plead', 0.022 * s, 0.05 * s, (0, 0, -0.49 * s), rot=(180, 0, 0), mat=flat(INK, 0.5), segs=6, r_top=0.0,
               bevel=0.0),
           cyl('pband', 0.063 * s, 0.05 * s, (0, 0, 0.25 * s), mat=flat('#B9C2CE', 0.3, 0.7), segs=12),
           cyl('peraser', 0.06 * s, 0.07 * s, (0, 0, 0.3 * s), mat=flat('#F28DB2', 0.6), segs=12, bevel=0.02 * s)]
    objs.append(L.group(pen, 'pencil', loc=(-0.12 * s, -0.02 * s, 0.0), rot=(0, 35, 0)))
    objs.append(sphere('apple', 0.17 * s, (0.15 * s, -0.08 * s, -0.12 * s), flat('#D9483B', 0.35), scale=(1.05, 0.95, 0.92),
                       segs=22, rings=12))
    objs.append(cyl('astem', 0.015 * s, 0.08 * s, (0.15 * s, -0.08 * s, 0.03 * s), rot=(0, 10, 0),
                    mat=flat('#5E3A22', 0.8), segs=6))
    objs.append(sphere('aleaf', 0.06 * s, (0.21 * s, -0.08 * s, 0.07 * s), flat('#3E9A5A', 0.6), scale=(1, 0.35, 0.5),
                       rot=(0, -30, 0), segs=10, rings=6))
    return objs


def em_pinecone(s=1.0, col='#9A5A2E'):
    """Pinecone (the town's mark): stacked scale rings on an egg shape + a little sprig."""
    objs = []
    m1, m2 = flat(col, 0.7), flat(hexmix(col, '#000000', 0.2), 0.7)
    mb = L.MB()
    rows = 7
    for k in range(rows):
        t = k / (rows - 1)
        z = (-0.26 + 0.5 * t) * s
        r = (0.06 + 0.17 * math.sin(math.pi * (0.15 + 0.75 * t))) * s
        n = max(5, int(10 * math.sin(math.pi * (0.15 + 0.75 * t))) + 3)
        for j in range(n):
            a = math.tau * (j + 0.5 * (k % 2)) / n
            mb.sphere(0.06 * s * (0.6 + 0.6 * math.sin(math.pi * (0.15 + 0.75 * t))), m1 if (j + k) % 2 else m2,
                      loc=(r * math.cos(a), r * math.sin(a), z), scale=(1.0, 1.0, 0.6),
                      rot=(0, 0, 0), segs=8, rings=5)
    objs.append(mb.done('cone'))
    objs.append(sphere('core', 0.16 * s, (0, 0, -0.02 * s), m2, scale=(1, 1, 1.5), segs=14, rings=10))
    gm = flat('#2E6B4F', 0.75)
    for k in range(5):
        a = math.radians(-40 + 20 * k)
        objs.append(cyl('needle', 0.012 * s, 0.18 * s, (0.0, 0.0, 0.24 * s), rot=(0, math.degrees(a), 0), mat=gm, segs=6))
    return objs


def em_sled(s=1.0, col='#D9483B'):
    wood = flat(col, 0.5)
    iron = flat('#3D424C', 0.4, 0.6)
    objs = [box('slat', (0.62 * s, 0.05 * s, 0.07 * s), (0, -0.02 * s, 0.02 * s), mat=wood, bevel=0.015 * s)]
    mb = L.MB()
    pts = [(-0.34, -0.12), (0.28, -0.12), (0.36, -0.08), (0.38, 0.02), (0.33, 0.08)]
    for a, b in zip(pts, pts[1:]):
        mb.seg(Vector((a[0] * s, -0.05 * s, a[1] * s)), Vector((b[0] * s, -0.05 * s, b[1] * s)), 0.02 * s, iron, segs=8)
    for x in (-0.22, 0.12):
        mb.seg(Vector((x * s, -0.04 * s, -0.12 * s)), Vector((x * s, -0.04 * s, 0.02 * s)), 0.02 * s, iron, segs=8)
    objs.append(mb.done('runner'))
    objs.append(L.smooth_tube('rope', [(0.36 * s, -0.06 * s, 0.05 * s), (0.42 * s, -0.08 * s, 0.18 * s),
                                       (0.3 * s, -0.08 * s, 0.26 * s)], 0.012 * s, flat('#D9C39A', 0.8)))
    return objs


def em_train(s=1.0, col='#D9483B'):
    m = flat(col, 0.45)
    dk = flat('#2B2F3A', 0.5)
    objs = [box('tcab', (0.22 * s, 0.1 * s, 0.26 * s), (0.18 * s, 0, -0.1 * s), mat=m, bevel=0.02 * s),
            box('troof', (0.28 * s, 0.12 * s, 0.04 * s), (0.18 * s, 0, 0.16 * s), mat=dk, bevel=0.01 * s),
            cyl('tboiler', 0.11 * s, 0.32 * s, (-0.07 * s, 0, -0.02 * s), rot=(0, 90, 0), mat=m, segs=20,
                origin='center', bevel=0.02 * s),
            cyl('tfunnel', 0.04 * s, 0.14 * s, (-0.16 * s, 0, 0.08 * s), mat=dk, r_top=0.06 * s, segs=12),
            box('twin', (0.1 * s, 0.11 * s, 0.08 * s), (0.18 * s, 0, 0.0), mat=flat(GLOW, 0.4), bevel=0.01 * s)]
    for x in (-0.15, 0.0, 0.17):
        objs.append(cyl('twheel', 0.06 * s, 0.11 * s, (x * s, 0, -0.14 * s), rot=(90, 0, 0), mat=dk, segs=16,
                        origin='center', bevel=0.01 * s))
    return objs


EMBLEMS = {'coffee': em_coffee, 'scissors': em_scissors, 'comb': em_comb, 'flower': em_flower, 'tulip': em_tulip,
           'book': em_book, 'teddy': em_teddy, 'plate': em_plate, 'basket': em_basket, 'hammer_wrench': em_hammer_wrench,
           'saw': em_saw, 'envelope': em_envelope, 'heart_plus': em_heart_plus, 'star': em_star, 'helmet': em_helmet,
           'tshirt': em_tshirt, 'clock': em_clock, 'pencil_apple': em_pencil_apple, 'pinecone': em_pinecone,
           'sled': em_sled, 'train': em_train}


# =========================================================================== street props

def picket_fence(name, p0, p1, h=0.62, col='#F4F1EA', spacing=0.17, seed=0, snow=True):
    """Low white picket fence from p0 to p1 (ground points)."""
    a, b = Vector((p0[0], p0[1], 0)), Vector((p1[0], p1[1], 0))
    d = b - a
    ln = d.length
    u = d.normalized()
    ang = math.degrees(math.atan2(u.y, u.x))
    m = flat(col, 0.7)
    mb = L.MB()
    n = max(2, int(ln / spacing))
    for k in range(n + 1):
        p = a + d * (k / n)
        mb.cube((0.07, 0.035, h), m, loc=(p.x, p.y, h / 2), rot=(0, 0, ang))
        mb.cone(0.05, 0.0, 0.07, m, loc=(p.x, p.y, h + 0.03), rot=(0, 0, ang + 45), segs=4)
    for z in (0.18, h - 0.16):
        mb.cube((ln, 0.04, 0.06), m, loc=tuple((a + b) / 2 + Vector((0, 0, z))), rot=(0, 0, ang))
    objs = [mb.done(name, smooth=False)]
    if snow:
        objs.append(L.snow_slab(name + '_s', ln, 0.07, 0.035, tuple((a + b) / 2 + Vector((0, 0, h - 0.1))),
                                rot=(0, 0, ang), seed=seed))
    return objs


def street_lamp(name, loc, h=2.7, col='#2E3A4A', strength=4.0, double=False):
    """Town street light: cast-iron post with a fluted base, curled arm(s) and a glowing lantern head."""
    x, y, z = loc
    iron = flat(col, 0.4, 0.55)
    objs = [cyl(name + '_base', 0.17, 0.32, (x, y, z), mat=iron, segs=16, r_top=0.11, bevel=0.03),
            cyl(name + '_post', 0.06, h - 0.3, (x, y, z + 0.3), mat=iron, segs=14, r_top=0.045),
            sphere(name + '_knob', 0.07, (x, y, z + h + 0.02), iron, segs=12, rings=8)]
    heads = [(0.0, 1)] if not double else [(1, 1), (-1, 1)]
    for k, (sx, _) in enumerate(heads):
        hx = x + sx * 0.4 * (1 if double else 0)
        hy = y + sx * 0.4 * (1 if double else 0)
        if double:
            mb = L.MB()
            mb.seg(Vector((x, y, z + h - 0.1)), Vector((hx, hy, z + h - 0.05)), 0.03, iron, segs=8)
            objs.append(mb.done(name + '_arm%d' % k))
            top = z + h - 0.05
        else:
            hx, hy, top = x, y, z + h
        lm = L.emissive(name + '_glass%d' % k, '#FFD98A', '#FFB84A', strength * 0.55)
        objs.append(cyl(name + '_cup%d' % k, 0.07, 0.08, (hx, hy, top - 0.42), mat=iron, segs=12, r_top=0.12))
        objs.append(cyl(name + '_gl%d' % k, 0.14, 0.34, (hx, hy, top - 0.4), mat=lm, segs=16, r_top=0.17,
                        bevel=0.02))
        for a in range(4):
            aa = math.tau * a / 4 + math.pi / 4
            objs.append(box(name + '_bar%d' % k, (0.025, 0.025, 0.34), (hx + 0.16 * math.cos(aa), hy + 0.16 * math.sin(aa),
                                                                        top - 0.4), mat=iron, bevel=0.0))
        objs.append(cyl(name + '_hat%d' % k, 0.24, 0.14, (hx, hy, top - 0.07), mat=iron, segs=16, r_top=0.04,
                        bevel=0.02))
        objs.append(PA.snow_cap(name + '_sn%d' % k, 0.15, (hx, hy, top + 0.03), 0.05, 3 + k))
        L.point_light(name + '_l%d' % k, (hx + 0.2, hy - 0.2, top - 0.25), 'window', 10.0, 0.08)
    return objs, (x, y, z + h - 0.25)


def town_bench(name, loc, rot_z=0.0, col='#C98F55', iron='#2E3A4A', snow=True):
    """Park bench (wooden slats on cast-iron legs, with a backrest), long axis along local X, seat faces -Y."""
    wood = tonal(col, 0.06, 3.0, rough=0.7)
    im = flat(iron, 0.4, 0.55)
    objs = []
    for k in range(3):
        objs.append(box(name + '_seat', (1.7, 0.13, 0.05), (0, -0.16 + 0.15 * k, 0.43), mat=wood, bevel=0.02))
    for k in range(2):
        objs.append(box(name + '_back', (1.7, 0.05, 0.13), (0, 0.2, 0.62 + 0.17 * k), rot=(-10, 0, 0), mat=wood,
                        bevel=0.02))
    for x in (-0.68, 0.68):
        objs.append(box(name + '_leg', (0.07, 0.5, 0.06), (x, 0.0, 0.38), mat=im, bevel=0.015))
        objs.append(box(name + '_lf', (0.07, 0.06, 0.4), (x, -0.2, 0.0), mat=im, bevel=0.015))
        objs.append(box(name + '_lb', (0.07, 0.06, 0.95), (x, 0.2, 0.0), rot=(-10, 0, 0), mat=im, bevel=0.015))
        objs.append(box(name + '_arm', (0.08, 0.46, 0.05), (x, -0.02, 0.66), mat=im, bevel=0.02))
    if snow:
        objs.append(PA.snow_cap(name + '_s1', 0.22, (0.4, 0.0, 0.48), 0.06, 3, scale=(1.6, 1.0, 1.0)))
        objs.append(PA.snow_cap(name + '_s2', 0.12, (-0.55, 0.05, 0.48), 0.05, 4, scale=(1.4, 1.0, 1.0)))
        objs.append(L.snow_slab(name + '_s3', 1.4, 0.06, 0.04, (0.05, 0.22, 0.97), seed=2))
    return L.group(objs, name, loc=loc, rot=(0, 0, rot_z))


def flower_tub(name, loc, r=0.26, col='#B4593F', flowers=('#E8524A', '#F2C14E', '#F28DB2'), evergreen=False, seed=0):
    rnd = L.rng(seed)
    x, y, z = loc
    objs = [cyl(name + '_pot', r, r * 1.1, (x, y, z), mat=flat(col, 0.7), r_top=r * 1.18, segs=20, bevel=0.03),
            cyl(name + '_soil', r * 1.08, 0.04, (x, y, z + r * 1.05), mat=flat('soil', 0.9), segs=20, bevel=0.0)]
    if evergreen:
        with L.Collect() as pc:
            PA.pine(seed=seed + 3, tiers=3, base_r=0.5, top_z=1.3, tier_h=0.65, first_z=0.3, snow_f=0.6, tips=7,
                    trunk_r=0.07)
        g = BA.regroup(pc.objs, name + '_pine', loc=(x, y, z + r))
        g.scale = (r * 1.6, r * 1.6, r * 1.6)
        objs.append(g)
    else:
        for k in range(7):
            a = rnd.uniform(0, math.tau)
            rr = rnd.uniform(0, r * 0.7)
            objs.append(sphere(name + '_lf', r * 0.32, (x + rr * math.cos(a), y + rr * math.sin(a), z + r * 1.15),
                               flat('#3E7F55', 0.8), scale=(1, 1, 0.7), segs=10, rings=6))
        for k in range(6):
            a = rnd.uniform(0, math.tau)
            rr = rnd.uniform(0, r * 0.75)
            objs.append(sphere(name + '_fl', r * 0.17, (x + rr * math.cos(a), y + rr * math.sin(a), z + r * 1.4),
                               flat(flowers[k % len(flowers)], 0.5), segs=10, rings=6))
        objs.append(PA.snow_cap(name + '_sn', r * 0.5, (x - r * 0.2, y + r * 0.2, z + r * 1.45), 0.05, seed))
    return objs


def snow_patch(name, loc, r=0.3, seed=0):
    return LA.snow_drift(name, r, loc, seed=seed)
