"""
civ_assets.py - civic & incident set "살아 있는 도시" (docs/CONTRACT_V8.md section AB): bank + police station as
CUTAWAY layer builds, wanted board, hydrant, fire alarm post, burnt ruins (S/M/L plots + a burnt townhouse), rubble,
demolition fence, insurance / for-sale / sold signs, moving boxes, furniture piles, welcome mat.
Excavator + dump truck live in civ_veh.py; the scorch decals are procedural (civ_decals.py).

Registry CIV maps a build key to its builder + metadata, in the format of bld_assets.BLD (so the plain builds go
through bld_render.render_build() unchanged) plus:
    cutaway=True      -> civ_render.render_cutaway() renders one frame per layer (see civ_lib doc)
    zone              -> manifest grouping ('civic', 'police', 'fire', 'ruins', 'demolition', 'moving')
    name {ko, en}

Conventions (as bld_assets / town_assets): 1 unit = 1 m, origin = footprint centre = sprite anchor, local front =
-Y (screen down-left), markers via bld_assets.mark().  Cutaway interiors stand on a raised floor (PL): interior
points already include that lift.

Not run directly - see civ_render.py.
"""
import math
from collections import OrderedDict

import bpy  # noqa: F401
from mathutils import Vector, Euler

import prop_lib as L
from prop_lib import C, flat, snowy, tonal, box, cyl, sphere, blob, log, extrude, hexmix
import prop_assets as PA
import life_assets as LA
import bld_assets as BA
import town_lib as T
import civ_lib as CL
from civ_lib import layer
from bld_assets import mark

CIV = OrderedDict()


def civ(key, kind, atlas, fp=None, yaw=0.0, shadow=True, samples=40, notes='', front='-Y', catcher=20.0, work=0,
        fps=8, sprites=None, extra=None, ko=None, en=None, zone=None, cutaway=False, anim_name=None):
    def deco(fn):
        ex = dict(extra or {})
        if ko or en:
            ex['name'] = {'ko': ko or key, 'en': en or key}
        if zone:
            ex['zone'] = zone
        CIV[key] = dict(key=key, fn=fn, kind=kind, atlas=atlas, fp=fp, yaw=yaw, shadow=shadow, samples=samples,
                        notes=notes, front=front, catcher=catcher, work=work, fps=fps, item=None, sprites=sprites,
                        extra=ex, cutaway=cutaway, anim_name=anim_name)
        return fn
    return deco


def tiles_mat(c1, c2, n=6.0, name='civ_tiles'):
    key = ('civ_tiles', c1, c2, n)
    if key in L._CUSTOM:
        return L._CUSTOM[key]
    nb = L.NB(name, rough=0.55)
    tc = nb.n('ShaderNodeTexCoord')
    ch = nb.n('ShaderNodeTexChecker')
    ch.inputs['Color1'].default_value = nb.rgb(c1)
    ch.inputs['Color2'].default_value = nb.rgb(c2)
    ch.inputs['Scale'].default_value = n
    nb.link(tc.outputs['Object'], ch.inputs['Vector'])
    nb.base(ch.outputs['Color'])
    L._CUSTOM[key] = nb.m
    return nb.m


def inner_window(name, loc, face='y-', w=0.6, h=0.8, curtain='#D9483B', frame='#F2EEE6', seed=0):
    """Window seen from INSIDE (daylight, pale blue sky + snow line) with a pair of tied-back curtains.
    loc = top-centre of the glass on the wall surface."""
    fm = flat(frame, 0.7)
    sky = L.emissive(name + '_sky', '#CFE6F6', '#D8ECFA', 1.1)
    objs = [box(name + '_fr', (w + 0.14, 0.06, h + 0.14), (0, -0.01, -h - 0.07), mat=fm, bevel=0.02),
            box(name + '_gl', (w, 0.04, h), (0, -0.035, -h), mat=sky, bevel=0.0),
            box(name + '_snowline', (w, 0.045, h * 0.18), (0, -0.04, -h), mat=L.emissive(name + '_sn', '#F4F7FB',
                                                                                       '#F4F7FB', 0.8), bevel=0.0),
            box(name + '_b1', (0.04, 0.06, h), (0, -0.05, -h), mat=fm, bevel=0.0),
            box(name + '_b2', (w, 0.06, 0.04), (0, -0.05, -h / 2 - 0.02), mat=fm, bevel=0.0),
            box(name + '_sill', (w + 0.24, 0.16, 0.05), (0, -0.07, -h - 0.12), mat=fm, bevel=0.015)]
    cm = flat(curtain, 0.85)
    for sx in (-1, 1):
        objs.append(box(name + '_cu', (w * 0.22, 0.05, h + 0.12), (sx * (w / 2 - w * 0.06), -0.09, -h - 0.02),
                        mat=cm, bevel=0.02, taper=(1.6, 1.0)))
        objs.append(sphere(name + '_tie', 0.035, (sx * (w / 2 - w * 0.04), -0.12, -h * 0.55), flat('#F2C14E', 0.4),
                           segs=8, rings=6))
    objs.append(box(name + '_rod', (w + 0.3, 0.03, 0.03), (0, -0.1, 0.06), mat=flat('#8A5A33', 0.5), bevel=0.01))
    return T.face_group(objs, face, loc, name)


def wall_lamp_in(name, loc, face='y-', strength=2.5):
    """Brass sconce with a frosted tulip shade (inside walls)."""
    lm = L.emissive(name + '_g', '#FFE7B0', '#FFD27A', strength)
    objs = [box(name + '_pl', (0.1, 0.03, 0.16), (0, -0.015, -0.08), mat=CL.brass(), bevel=0.01),
            cyl(name + '_arm', 0.015, 0.16, (0, -0.02, 0.0), rot=(90, 0, 0), mat=CL.brass(), segs=8),
            cyl(name + '_sh', 0.05, 0.12, (0, -0.17, -0.02), mat=lm, r_top=0.085, segs=14, bevel=0.01)]
    return T.face_group(objs, face, loc, name)


def cap_strip(name, pieces, col=CL.CUT, h=0.035):
    """Dollhouse 'cut' cap on top of wall pieces (a slightly wider cream strip) so the sliced wall reads cleanly."""
    out = []
    m = flat(col, 0.75)
    for p in pieces:
        bpy.context.view_layer.update()
        dims = p.dimensions
        loc = p.location
        out.append(box(name, (dims.x + 0.01, dims.y + 0.01, h), (loc.x, loc.y, loc.z + dims.z - 0.005), mat=m,
                       bevel=0.008))
    return out


def column(name, x, y, z0, h, r=0.13, col='#F4F1EA', cap_col=None):
    """Classical toy column: square base, fluted shaft (stripes), round capital + square abacus."""
    cm = flat(col, 0.55)
    fl = L.stripes(col, hexmix(col, '#000000', 0.07), 18.0, 'X', rough=0.55, soft=0.15)
    objs = [box(name + '_b', (r * 2.6, r * 2.6, 0.12), (x, y, z0), mat=cm, bevel=0.025),
            cyl(name + '_t', r * 1.1, 0.08, (x, y, z0 + 0.12), mat=cm, segs=24, bevel=0.02),
            cyl(name + '_s', r, h - 0.42, (x, y, z0 + 0.2), mat=fl, segs=24, r_top=r * 0.9, bevel=0.01),
            cyl(name + '_c', r * 0.95, 0.1, (x, y, z0 + h - 0.22), mat=cm, segs=24, r_top=r * 1.25, bevel=0.02),
            box(name + '_a', (r * 2.7, r * 2.7, 0.12), (x, y, z0 + h - 0.12), mat=flat(cap_col or col, 0.55),
                bevel=0.025)]
    return objs


# =========================================================================== emblems

def em_coin(s=1.0, face='#F2C14E', rim='#D9A93E', mark_col='#B47A2A'):
    """Gold coin standing up, with a raised pinecone (the town's mark) and a beaded rim."""
    objs = [cyl('coin', 0.36 * s, 0.09 * s, (0, -0.02 * s, 0), rot=(90, 0, 0), mat=flat(face, 0.3, 0.75), segs=40,
                origin='center', bevel=0.02 * s, cap_mat=flat(hexmix(face, '#FFFFFF', 0.1), 0.25, 0.75)),
            cyl('coinrim', 0.38 * s, 0.07 * s, (0, -0.01 * s, 0), rot=(90, 0, 0), mat=flat(rim, 0.3, 0.75), segs=40,
                origin='center', bevel=0.015 * s)]
    mb = L.MB()
    for k in range(24):
        a = math.tau * k / 24
        mb.sphere(0.018 * s, flat(rim, 0.3, 0.75), loc=(0.3 * s * math.cos(a), -0.075 * s, 0.3 * s * math.sin(a)),
                  segs=6, rings=4)
    objs.append(mb.done('beads'))
    with L.Collect() as pc:
        T.em_pinecone(0.62 * s, col=mark_col)
    g = L.group(BA.top_level(pc.objs), 'coinmark', loc=(0, -0.11 * s, -0.01 * s), rot=(90, 0, 0))
    g.scale = (1.0, 1.0, 0.35)
    objs.append(g)
    return objs


def em_piggy(s=1.0, col='#F4A6B8', coin=True):
    """Pink piggy bank (round body, snout, ears, coin slot, curly tail) - facing -Y."""
    pm = flat(col, 0.45)
    dk = flat(hexmix(col, '#7A2E45', 0.35), 0.5)
    objs = [sphere('pig', 0.3 * s, (0, 0, 0), pm, scale=(1.15, 0.95, 0.95), segs=28, rings=16),
            cyl('snout', 0.1 * s, 0.1 * s, (0.0, -0.3 * s, -0.02 * s), rot=(90, 0, 0), mat=pm, segs=20,
                origin='center', bevel=0.03 * s),
            sphere('n1', 0.022 * s, (-0.035 * s, -0.355 * s, -0.02 * s), dk, segs=8, rings=6),
            sphere('n2', 0.022 * s, (0.035 * s, -0.355 * s, -0.02 * s), dk, segs=8, rings=6),
            sphere('e1', 0.03 * s, (-0.12 * s, -0.26 * s, 0.1 * s), flat('#2B2F3A', 0.3), segs=10, rings=6),
            sphere('e2', 0.03 * s, (0.12 * s, -0.26 * s, 0.1 * s), flat('#2B2F3A', 0.3), segs=10, rings=6),
            sphere('ch1', 0.045 * s, (-0.2 * s, -0.22 * s, 0.0), flat('#F27C96', 0.6), scale=(1, 0.5, 0.7), segs=10,
                   rings=6),
            sphere('ch2', 0.045 * s, (0.2 * s, -0.22 * s, 0.0), flat('#F27C96', 0.6), scale=(1, 0.5, 0.7), segs=10,
                   rings=6)]
    for sx in (-1, 1):
        objs.append(extrude('ear', [(-0.07 * s, 0.0), (0.07 * s, 0.0), (0.0, 0.12 * s)], 0.03 * s, rot=(90, 0, 0),
                            top=pm, side=pm, bevel=0.01 * s))
        objs[-1].location = (sx * 0.16 * s, -0.12 * s, 0.22 * s)
        objs[-1].rotation_euler = Euler((math.radians(80), 0, math.radians(sx * 15)), 'XYZ')
        for sy in (-1, 1):
            objs.append(cyl('leg', 0.06 * s, 0.12 * s, (sx * 0.18 * s, sy * 0.12 * s, -0.36 * s), mat=pm, segs=12,
                            bevel=0.02 * s))
    objs.append(box('slot', (0.14 * s, 0.03 * s, 0.02 * s), (0, 0.02 * s, 0.28 * s), mat=dk, bevel=0.005))
    if coin:
        objs.append(cyl('pcoin', 0.07 * s, 0.02 * s, (0, 0.02 * s, 0.33 * s), rot=(90, 0, 0), mat=CL.gold(),
                        segs=20, origin='center', bevel=0.005))
    mb = L.MB()
    pts = [Vector((0.0, 0.3 * s + 0.02 * s * k, 0.05 * s + 0.04 * s * math.sin(k * 1.4))) +
           Vector((0.04 * s * math.cos(k * 1.4), 0, 0)) for k in range(7)]
    for p, q in zip(pts, pts[1:]):
        mb.seg(p, q, 0.015 * s, pm, segs=6)
    objs.append(mb.done('tail'))
    return objs


# =========================================================================== BANK (cutaway)

BANK_NOTE = ('Bank "솔방울 은행" (5.4 x 4.6 m footprint): cream sandstone hall on a stone plinth with a white columned '
             'portico, teal pediment with a gold pinecone coin, a big gold coin standing on the roof and a piggy-bank '
             'bracket sign. CUTAWAY: bank_floor (checker marble floor, red runner, steps, planters, ground shadow), '
             'bank_back (the two far walls from inside: wallpaper, wainscot, windows, clock, number display), '
             'bank_interior (vault room, teller stools, money cart, ATM, waiting chairs, piggy statue, manager '
             'corner), bank_front (teller counter with glass partitions + manager desk = what stands in front of '
             'staff), bank_vault (round vault door overlay: anims.vault 8 f opens, vault_close reverses), '
             'bank_shell_cut (dollhouse wall stubs), bank_shell (closed hall). bank = the closed building in one '
             'frame. staffPoints = 3 tellers + manager (behind slot), counterPoints = where customers are served, '
             'customerPoints = the queue (first = next in line), seatPoints = waiting chairs, atmPoint, vaultPoint, '
             'entryPoint (just inside), doorPoint (outside, foot of the steps).')

B_X0, B_X1, B_Y0, B_Y1 = -2.3, 2.3, -1.4, 1.9
B_T, B_PL, B_H = 0.16, 0.32, 3.02
B_STUB = 0.55


@civ('bank', 'building', 'civ_bank', fp=(5.4, 4.6), catcher=30.0, samples=48, notes=BANK_NOTE, ko='은행', en='Bank',
     zone='civic', cutaway=True)
def b_bank():
    x0, x1, y0, y1, t, PL, H = B_X0, B_X1, B_Y0, B_Y1, B_T, B_PL, B_H
    xi0, xi1, yi0, yi1 = x0 + t, x1 - t, y0 + t, y1 - t
    stone = '#B9B0A2'
    cream = '#EFE2C4'
    teal = '#2F7D73'
    trim = '#F4F1EA'
    door_x = 0.0
    # ------------------------------------------------------------------ floor
    with layer('floor'):
        box('plinth', (x1 - x0 + 0.14, y1 - y0 + 0.14, PL), (0, (y0 + y1) / 2, 0),
            mat=snowy(stone, lo=0.8, hi=0.92, noise_amt=0.3), bevel=0.04)
        box('tiles', (xi1 - xi0 + 0.02, yi1 - yi0 + 0.02, 0.025), (0, (yi0 + yi1) / 2, PL - 0.005),
            mat=tiles_mat('#F3E9D2', '#7FB5AB', 2.6), bevel=0.0)
        # red runner from the door to the counter, gold edges
        box('runner', (0.78, 1.5, 0.012), (door_x, yi0 + 0.75, PL + 0.02), mat=flat('#C0392B', 0.85), bevel=0.0)
        for s in (-1, 1):
            box('runner_e', (0.05, 1.5, 0.014), (door_x + s * 0.37, yi0 + 0.75, PL + 0.02), mat=flat('#F2C14E', 0.6),
                bevel=0.0)
        # round rug in the waiting corner
        cyl('rug', 0.62, 0.012, (1.4, -0.75, PL + 0.02), mat=flat('#E8C25A', 0.9), segs=36, bevel=0.0)
        cyl('rug2', 0.5, 0.014, (1.4, -0.75, PL + 0.02), mat=flat('#D9A93E', 0.9), segs=36, bevel=0.0)
        # landing + steps in front of the portico
        sm = snowy(stone, lo=0.62, hi=0.8, noise_amt=0.3)
        box('landing', (2.9, 0.62, PL), (0, y0 - 0.31, 0), mat=sm, bevel=0.03)
        box('step2', (2.9, 0.2, PL * 0.66), (0, y0 - 0.72, 0), mat=sm, bevel=0.03)
        box('step1', (2.9, 0.2, PL * 0.33), (0, y0 - 0.9, 0), mat=sm, bevel=0.03)
        box('runner_out', (0.78, 0.6, 0.012), (door_x, y0 - 0.3, PL), mat=flat('#C0392B', 0.85), bevel=0.0)
        # planters with little pines beside the steps + snow
        for k, sx in enumerate((-1, 1)):
            T.flower_tub('tub%d' % k, (sx * 1.82, y0 - 0.55, 0.0), r=0.24, col='#2F7D73', evergreen=True,
                         seed=40 + k)
        T.street_lamp('lamp', (x1 + 0.22, y0 - 0.62, 0.0), h=2.5)
        for k, (x, y, r) in enumerate(((x0 - 0.15, y1 + 0.1, 0.3), (x1 + 0.2, y1 - 0.4, 0.26),
                                      (x0 + 0.2, y0 - 0.55, 0.22))):
            LA.snow_drift('drift%d' % k, r, (x, y, 0.0), seed=60 + k)
    # ------------------------------------------------------------------ back walls (seen from inside)
    paper = L.stripes('#E3EFE6', '#D2E5D8', 9.0, 'X', rough=0.85, soft=0.12)
    paper_y = L.stripes('#E3EFE6', '#D2E5D8', 9.0, 'Y', rough=0.85, soft=0.12)
    vx0, vx1, vy0, vy1, vz = xi0, -0.62, 1.02, yi1, PL + 2.3       # vault room (back-left corner)
    vcx, vcz, vr = -1.38, PL + 1.02, 0.52
    with layer('back'):
        bw = CL.wall_x('wall_back', x0, x1, y1 - t / 2, PL, H, t, paper)
        lw = CL.wall_y('wall_left', y0, y1 - t, x0 + t / 2, PL, H, t, paper_y)
        cap_strip('wcap', bw + lw)
        CL.wainscot('wsb', vx1, xi1, yi1, 0.9, face='y-', col='#7A4E2E', cap='#C98F55', z0=PL)
        CL.wainscot('wsl', yi0, vy0, xi0, 0.9, face='x+', col='#7A4E2E', cap='#C98F55', z0=PL)
        inner_window('bwin0', (0.02, yi1, PL + 2.25), 'y-', w=0.5, h=0.8, curtain='#2F7D73', seed=1)
        inner_window('bwin1', (1.8, yi1, PL + 2.25), 'y-', w=0.5, h=0.8, curtain='#2F7D73', seed=2)
        inner_window('lwin0', (xi0, 0.35, PL + 2.25), 'x+', w=0.5, h=0.8, curtain='#2F7D73', seed=3)
        # number display (dark panel, three amber number tiles) over the middle teller window
        disp = [box('disp', (0.86, 0.06, 0.36), (0, -0.03, -0.36), mat=flat('#2B2F3A', 0.4), bevel=0.03)]
        for k, dx in enumerate((-0.26, 0.0, 0.26)):
            disp.append(box('dtile', (0.2, 0.03, 0.24), (dx, -0.07, -0.3), mat=L.emissive('dt%d' % k, '#FFB347',
                                                                                        '#FFB347', 1.8), bevel=0.01))
        disp.append(sphere('dbell', 0.05, (0.0, -0.08, 0.05), flat('#D9483B', 0.4), scale=(1, 0.6, 0.8), segs=10,
                           rings=6))
        T.face_group(disp, 'y-', (0.92, yi1, PL + 2.42), 'display')
        CL.wall_clock('clock', (xi0, -0.45, PL + 2.3), 'x+', r=0.2)
        wall_lamp_in('sc0', (0.52, yi1, PL + 1.75), 'y-')
        wall_lamp_in('sc1', (1.32, yi1, PL + 1.75), 'y-')
        wall_lamp_in('sc2', (xi0, -1.0, PL + 1.75), 'x+')

        def coin_pic(objs, w, h):
            objs.append(cyl('pcoin', 0.12, 0.03, (0, -0.06, 0.0), rot=(90, 0, 0), mat=CL.gold(), segs=24,
                            origin='center', bevel=0.01))
            objs.append(box('phill', (w * 0.9, 0.02, h * 0.3), (0, -0.058, -h * 0.5), mat=flat('#7FB5AB', 0.8),
                            bevel=0.0))
        CL.picture_frame('pic', (xi0, -0.45, PL + 1.6), 'x+', w=0.42, h=0.32, pic=coin_pic)
    # ------------------------------------------------------------------ interior
    steel = flat('#B4C0CD', 0.4, 0.25)
    steel_d = flat('#8C98A6', 0.45, 0.2)
    with layer('interior'):
        # vault room: steel box in the back-left corner with a round opening in its -Y face
        box('v_top', (vx1 - vx0, vy1 - vy0, 0.14), ((vx0 + vx1) / 2, (vy0 + vy1) / 2, vz - 0.14), mat=steel_d,
            bevel=0.03)
        box('v_side', (0.12, vy1 - vy0, vz - PL), (vx1 - 0.06, (vy0 + vy1) / 2, PL), mat=steel, bevel=0.03)
        vf = box('v_face', (vx1 - vx0, 0.14, vz - PL), ((vx0 + vx1) / 2, vy0 + 0.07, PL), mat=steel, bevel=0.03)
        hole = cyl('v_hole', vr + 0.02, 0.6, (vcx, vy0, vcz), rot=(90, 0, 0), mat=steel_d, segs=48,
                   origin='center', bevel=0.0)
        import veh_lib as VL
        VL.add_bool(vf, hole)
        ring = cyl('v_ring', vr + 0.12, 0.1, (vcx, vy0 - 0.03, vcz), rot=(90, 0, 0), mat=CL.gold(), segs=48,
                   origin='center', bevel=0.025)
        rh = cyl('v_ringh', vr + 0.015, 0.3, (vcx, vy0 - 0.03, vcz), rot=(90, 0, 0), mat=steel_d, segs=48,
                 origin='center', bevel=0.0)
        VL.add_bool(ring, rh)
        mbr = L.MB()
        for k in range(14):                         # rivets around the vault front
            for (px_, pz_) in ((vx0 + 0.12 + k * (vx1 - vx0 - 0.24) / 13, vz - 0.24), ):
                mbr.sphere(0.028, flat('#D9DFE6', 0.3, 0.6), loc=(px_, vy0 - 0.005, pz_), segs=8, rings=5)
        for k in range(6):
            for px_ in (vx0 + 0.14, vx1 - 0.18):
                mbr.sphere(0.028, flat('#D9DFE6', 0.3, 0.6), loc=(px_, vy0 - 0.005, PL + 0.25 + k * 0.3), segs=8,
                           rings=5)
        mbr.done('v_rivets')
        box('v_plate', (0.5, 0.03, 0.14), (vcx, vy0 - 0.02, vz - 0.48), mat=CL.gold(), bevel=0.02)
        # inside: dark back + shelves of gold bars, coin sacks, warm little lamp
        box('v_in', (vx1 - vx0 - 0.12, 0.05, vz - PL - 0.14), ((vx0 + vx1) / 2 - 0.06, vy1 - 0.03, PL),
            mat=flat('#4A515C', 0.6), bevel=0.0)
        for k, z in enumerate((PL + 0.68, PL + 1.18)):
            box('v_shelf', (vx1 - vx0 - 0.3, 0.42, 0.04), (vcx, vy1 - 0.24, z), mat=steel_d, bevel=0.01)
            mb = L.MB()
            for j in range(6):
                for row in range(2):
                    mb.cube((0.13, 0.17, 0.06), CL.gold(), loc=(vcx - 0.42 + 0.17 * j, vy1 - 0.24 - 0.04 * row,
                                                                z + 0.07 + 0.066 * row))
            mb.done('v_gold%d' % k, bevel=0.012)
        for j, dx in enumerate((-0.25, 0.22)):
            blob('v_sack', 0.15, (vcx + dx, vy1 - 0.3, PL + 0.15), flat('#D8C39A', 0.85), scale=(1, 1, 1.15),
                 seed=70 + j, amp=0.15, subdiv=3, flat_bottom=0.5)
            cyl('v_tie', 0.06, 0.06, (vcx + dx, vy1 - 0.3, PL + 0.3), mat=flat('#8A5A33', 0.7), segs=10)
        L.point_light('v_light', (vcx, vy1 - 0.4, vz - 0.35), 'window', 7.0, 0.1)
        # teller stools + back cabinet with drawers
        for k, x in enumerate((0.12, 0.92, 1.72)):
            cyl('stool', 0.16, 0.05, (x, 1.18, PL + 0.6), mat=flat('#C0392B', 0.6), segs=18, bevel=0.02)
            cyl('stoolp', 0.03, 0.6, (x, 1.18, PL), mat=CL.brass(), segs=8)
            cyl('stoolf', 0.14, 0.03, (x, 1.18, PL), mat=CL.brass(), segs=14)
        box('cab', (1.5, 0.4, 0.85), (0.92, yi1 - 0.22, PL), mat=flat('#8A5A33', 0.6), bevel=0.03)
        box('cabtop', (1.56, 0.46, 0.05), (0.92, yi1 - 0.22, PL + 0.85), mat=flat('#C98F55', 0.55), bevel=0.015)
        for k in range(4):
            box('drawer', (0.3, 0.03, 0.28), (0.36 + 0.37 * k, yi1 - 0.43, PL + 0.42), mat=flat('#A86A36', 0.6),
                bevel=0.012)
            sphere('knob', 0.02, (0.36 + 0.37 * k, yi1 - 0.46, PL + 0.56), CL.brass(), segs=8, rings=6)
        for k in range(3):
            cyl('cstack', 0.06, 0.04 + 0.025 * k, (0.5 + 0.2 * k, yi1 - 0.22, PL + 0.9), mat=CL.gold(), segs=14,
                bevel=0.006)
        CL.potted_plant('bplant', (2.0, yi1 - 0.25, PL + 0.9), s=0.7, seed=4)
        # money cart beside the vault
        cx_ = -0.25
        box('cart', (0.42, 0.5, 0.3), (cx_, 1.36, PL + 0.18), mat=flat('#3D7CC9', 0.45), bevel=0.04)
        for sx in (-1, 1):
            for sy in (-1, 1):
                cyl('cw', 0.05, 0.04, (cx_ + sx * 0.16, 1.36 + sy * 0.19, PL + 0.05), rot=(0, 90, 0),
                    mat=flat('#2B2F3A', 0.6), segs=12, origin='center')
        for j, dy in enumerate((-0.1, 0.12)):
            blob('csack', 0.12, (cx_, 1.36 + dy, PL + 0.58), flat('#D8C39A', 0.85), scale=(1, 1, 1.1), seed=80 + j,
                 amp=0.15, subdiv=3, flat_bottom=0.5)
        cyl('ccoin', 0.05, 0.012, (cx_ - 0.1, 1.2, PL + 0.62), rot=(90, 0, 0), mat=CL.gold(), segs=14,
            origin='center')
        # manager corner (left): chair behind the desk (desk is in 'front'), coat stand
        mx, my = -1.37, -0.25
        box('mchair', (0.44, 0.48, 0.1), (mx - 0.5, my, PL + 0.4), mat=flat('#2F7D73', 0.6), bevel=0.04)
        box('mchairb', (0.1, 0.5, 0.62), (mx - 0.72, my, PL + 0.46), mat=flat('#2F7D73', 0.6), bevel=0.05)
        cyl('mchairp', 0.03, 0.4, (mx - 0.5, my, PL), mat=flat('#2B2F3A', 0.5), segs=8)
        # waiting chairs (row facing the door) + coffee table
        for k, x in enumerate((0.95, 1.4, 1.85)):
            CL.chair('wchair%d' % k, (x, -0.42, PL), rot_z=0.0, col='#C0392B')
        cyl('ctable', 0.2, 0.03, (1.4, -0.98, PL + 0.36), mat=flat('#C98F55', 0.55), segs=24, bevel=0.01)
        cyl('ctablep', 0.03, 0.36, (1.4, -0.98, PL), mat=CL.brass(), segs=8)
        box('mag', (0.18, 0.12, 0.012), (1.37, -0.98, PL + 0.4), rot=(0, 0, 18), mat=flat('#3D7CC9', 0.7), bevel=0.0)
        # ATM against the left wall (faces +X), front-left corner
        ay = -0.98
        box('atm', (0.44, 0.5, 1.32), (xi0 + 0.22, ay, PL), mat=flat('#2F7D73', 0.45), bevel=0.05)
        box('atm_face', (0.04, 0.4, 0.6), (xi0 + 0.45, ay, PL + 0.55), mat=flat('#F2EEE6', 0.5), bevel=0.02)
        box('atm_scr', (0.03, 0.28, 0.22), (xi0 + 0.47, ay, PL + 0.86), mat=L.emissive('atmscr', '#7FD3C6', '#9FF0E0',
                                                                                     1.6), bevel=0.01)
        box('atm_pad', (0.12, 0.22, 0.04), (xi0 + 0.52, ay, PL + 0.66), rot=(0, -25, 0), mat=flat('#B9C2CE', 0.4, 0.5),
            bevel=0.01)
        box('atm_slot', (0.03, 0.14, 0.025), (xi0 + 0.48, ay, PL + 0.6), mat=flat('#2B2F3A', 0.4), bevel=0.0)
        box('atm_top', (0.5, 0.58, 0.1), (xi0 + 0.24, ay, PL + 1.32), mat=flat('#F2C14E', 0.4), bevel=0.03)
        cyl('atm_coin', 0.09, 0.02, (xi0 + 0.48, ay, PL + 1.18), rot=(0, 90, 0), mat=CL.gold(), segs=18,
            origin='center', bevel=0.004)
        # piggy statue on a pedestal (front, left of the door)
        box('ped', (0.46, 0.46, 0.5), (-0.98, -0.95, PL), mat=flat('#F2EEE6', 0.5), bevel=0.04)
        box('pedtop', (0.52, 0.52, 0.06), (-0.98, -0.95, PL + 0.5), mat=CL.gold(), bevel=0.02)
        with L.Collect() as pg:
            em_piggy(1.0)
        L.group(BA.top_level(pg.objs), 'piggy', loc=(-0.98, -0.95, PL + 0.94), rot=(0, 0, 40))
        CL.potted_plant('fplant', (xi1 - 0.22, yi0 + 0.22, PL), s=1.0, seed=7)
        CL.potted_plant('vplant', (-0.5, 0.82, PL), s=0.9, seed=8, pot='#2F7D73')
        L.point_light('in_l1', (0.6, 0.6, PL + 2.4), 'window', 30.0, 0.3)
        L.point_light('in_l2', (-0.9, -0.4, PL + 2.4), 'window', 25.0, 0.3)
    # ------------------------------------------------------------------ front occluders: counter + manager desk
    wood = flat('#7A4E2E', 0.55)
    with layer('front'):
        cx0, cx1, cy = -0.38, xi1, 0.5
        box('ctr', (cx1 - cx0, 0.42, 0.95), ((cx0 + cx1) / 2, cy, PL), mat=wood, bevel=0.04)
        box('ctrside', (0.42, 0.42, 0.95), (cx0, cy, PL), mat=wood, bevel=0.04)
        for k in range(5):
            box('ctrp', (0.36, 0.03, 0.62), (cx0 + 0.3 + k * 0.5, cy - 0.22, PL + 0.16),
                mat=flat('#9A6A42', 0.55), bevel=0.02)
        box('ctrtop', (cx1 - cx0 + 0.08, 0.52, 0.06), ((cx0 + cx1) / 2 - 0.02, cy, PL + 0.95),
            mat=tonal('#F3E9D2', 0.05, 3.0, rough=0.3), bevel=0.02)
        box('ctrkick', (cx1 - cx0, 0.04, 0.1), ((cx0 + cx1) / 2, cy - 0.21, PL), mat=CL.brass(), bevel=0.01)
        gl = CL.glass_mat('ctr_glass', '#D6ECF6', 0.22)
        for k, x in enumerate((0.12, 0.92, 1.72)):
            CL.tag_glass([box('gpane', (0.7, 0.02, 0.62), (x, cy + 0.05, PL + 1.01), mat=gl, bevel=0.0)])
            box('gslot', (0.3, 0.03, 0.04), (x, cy + 0.05, PL + 1.0), mat=CL.brass(), bevel=0.005)
            cyl('nlamp', 0.07, 0.04, (x, cy + 0.04, PL + 1.72), rot=(90, 0, 0), mat=L.emissive('nl%d' % k, '#7FD37F',
                                                                                             '#9FF09F', 1.6),
                segs=16, origin='center')
            box('pad', (0.22, 0.14, 0.012), (x - 0.12, cy - 0.12, PL + 1.01), mat=flat('#F4F1EA', 0.7), bevel=0.0)
        for k, x in enumerate((-0.33, 0.52, 1.32, 2.1)):
            box('gpost', (0.05, 0.05, 0.72), (x, cy + 0.05, PL + 1.0), mat=CL.brass(), bevel=0.01)
        box('grail', (cx1 - cx0, 0.05, 0.05), ((cx0 + cx1) / 2, cy + 0.05, PL + 1.68), mat=CL.brass(), bevel=0.01)
        sphere('bell', 0.05, (0.45, cy - 0.12, PL + 1.03), CL.gold(), scale=(1, 1, 0.7), segs=12, rings=8)
        for k, x in enumerate((1.25, 1.33)):
            cyl('tcoins', 0.045, 0.05 + 0.03 * k, (x, cy - 0.1, PL + 1.01), mat=CL.gold(), segs=12, bevel=0.005)
        # manager desk (faces +X: the manager sits behind it on the wall side)
        box('mdesk', (0.5, 0.86, 0.72), (mx, my, PL), mat=wood, bevel=0.03)
        box('mdesktop', (0.56, 0.94, 0.05), (mx, my, PL + 0.72), mat=flat('#C98F55', 0.5), bevel=0.015)
        box('mdeskp', (0.03, 0.6, 0.45), (mx + 0.26, my, PL + 0.14), mat=flat('#9A6A42', 0.55), bevel=0.01)
        cyl('mlampp', 0.02, 0.32, (mx - 0.05, my - 0.32, PL + 0.77), mat=CL.brass(), segs=8)
        cyl('mlamps', 0.07, 0.1, (mx - 0.02, my - 0.32, PL + 1.05), rot=(0, 20, 0),
            mat=L.emissive('mlamp', '#3E8E57', '#FFE7B0', 1.2), segs=14, r_top=0.11)
        box('mpaper', (0.18, 0.25, 0.012), (mx + 0.02, my + 0.08, PL + 0.77), rot=(0, 0, -10),
            mat=flat('#F4F1EA', 0.7), bevel=0.0)
        box('mplate', (0.04, 0.28, 0.08), (mx + 0.22, my + 0.1, PL + 0.77), rot=(0, 20, 0), mat=CL.gold(),
            bevel=0.01)
    # ------------------------------------------------------------------ vault door (overlay)
    with layer('vault'):
        with L.Collect() as vd:
            cyl('vd', vr, 0.16, (0, -0.08, 0), rot=(90, 0, 0), mat=flat('#C7D0DA', 0.3, 0.35), segs=48,
                origin='center', bevel=0.03)
            cyl('vd_ring', vr * 0.8, 0.18, (0, -0.09, 0), rot=(90, 0, 0), mat=flat('#A9B4C1', 0.3, 0.35), segs=48,
                origin='center', bevel=0.02)
            mbb = L.MB()
            for k in range(12):
                a = math.tau * k / 12
                mbb.sphere(0.032, CL.gold(), loc=((vr - 0.07) * math.cos(a), -0.17, (vr - 0.07) * math.sin(a)),
                           segs=8, rings=5)
            mbb.done('vd_bolts')
            with L.Collect() as hw:
                cyl('vh_hub', 0.08, 0.12, (0, -0.22, 0), rot=(90, 0, 0), mat=CL.gold(), segs=18, origin='center',
                    bevel=0.02)
                mbh = L.MB()
                for k in range(5):
                    a = math.tau * k / 5 + 0.3
                    q = Vector((0.26 * math.cos(a), -0.27, 0.26 * math.sin(a)))
                    mbh.seg(Vector((0, -0.27, 0)), q, 0.02, CL.gold(), segs=8)
                    mbh.sphere(0.04, CL.gold(), loc=tuple(q), segs=10, rings=6)
                ring_pts = [Vector((0.24 * math.cos(math.tau * k / 30), -0.27, 0.24 * math.sin(math.tau * k / 30)))
                            for k in range(31)]
                for p, q in zip(ring_pts, ring_pts[1:]):
                    mbh.seg(p, q, 0.016, CL.gold(), segs=6)
                mbh.done('vh_wheel')
            handle = L.group(BA.top_level(hw.objs), 'vh', loc=(0, 0, 0))
            box('vd_hinge', (0.14, 0.14, 0.56), (-vr - 0.02, -0.1, -0.28), mat=steel_d, bevel=0.02)
        # group origin = the hinge axis; the door centre sits vr + 0.04 m toward +X from it
        hinge_x = vcx - vr - 0.04
        dg = L.group(BA.top_level(vd.objs), 'vault_door', loc=(0, 0, 0))
        for o in dg.children:
            o.location.x += vr + 0.04
        dg.location = (hinge_x, vy0 - 0.02, vcz)
    door_objs = [dg]

    def vault_set(i):
        # 0 closed, 1-2 wheel spins, 3..7 door swings open toward the room (hinge on the left)
        spin = [0, 50, 110, 110, 110, 110, 110, 110][i]
        swing = [0, 0, 0, 20, 45, 70, 92, 102][i]
        handle.rotation_euler = Euler((0, math.radians(spin), 0), 'XYZ')
        dg.rotation_euler = Euler((0, 0, math.radians(-swing)), 'XYZ')
    vault_set(0)
    CL.overlay('vault', door_objs, vault_set, 8, fps=8, repeat=0,
               extra={'drawAfter': 'interior', 'reverse': 'vault_close'})
    CL.bounds_marker('vb', (hinge_x + 0.05, vy0 - vr - 0.3, vcz))
    # ------------------------------------------------------------------ shell (closed building)
    plaster = T.plaster(cream)
    with layer('shell'):
        box('wall_front', (x1 - x0, t, H - PL), (0, y0 + t / 2, PL), mat=plaster, bevel=0.02)
        box('wall_right', (t, y1 - y0 - t, H - PL), (x1 - t / 2, (y0 + y1) / 2 + t / 2, PL), mat=plaster, bevel=0.02)
        T.corner_trims('ctrim', x1 - x0, y1 - y0, PL, H - PL, trim, x=0, y=(y0 + y1) / 2, t=0.2)
        T.band('base', x1 - x0, y1 - y0, PL, '#D9CBAE', h=0.22, out=0.03, x=0, y=(y0 + y1) / 2)
        T.band('cornice', x1 - x0, y1 - y0, H - 0.16, trim, h=0.18, out=0.08, x=0, y=(y0 + y1) / 2)
        T.flat_roof('roof', x1 - x0 + 0.12, y1 - y0 + 0.12, H + 0.02, col='#E6D9BC', parapet=0.34,
                    y=(y0 + y1) / 2, seed=91, cap_col=trim)
        T.door('door', (door_x, y0, PL), 'y-', w=1.0, h=1.8, col=teal, frame_col=trim, double=True, step=False,
               knob='gold')
        for k, x in enumerate((-1.62, 1.62)):
            T.win('fw%d' % k, (x, y0, PL + 2.2), 'y-', w=0.62, h=1.05, shutters=None, frame=trim, seed=10 + k)
            box('fwkey%d' % k, (0.16, 0.08, 0.2), (x, y0 - 0.06, PL + 2.22), mat=flat(trim, 0.6), bevel=0.02)
        for k, y in enumerate((-0.45, 1.05)):
            T.win('sw%d' % k, (x1, y, PL + 2.2), 'x+', w=0.62, h=1.05, shutters=None, frame=trim, seed=20 + k)
        T.lamp_wall('dl0', (door_x - 0.75, y0, PL + 1.95), 'y-')
        T.lamp_wall('dl1', (door_x + 0.75, y0, PL + 1.95), 'y-')
        # portico: 4 columns, entablature, pediment with the gold pinecone coin
        cyp = y0 - 0.4
        for k, x in enumerate((-1.08, -0.38, 0.38, 1.08)):
            column('col%d' % k, x, cyp, PL, 2.32, r=0.12)
        ez = PL + 2.32
        box('entab', (2.75, 0.62, 0.3), (0, y0 - 0.25, ez), mat=flat(trim, 0.6), bevel=0.03)
        box('entab_band', (2.77, 0.64, 0.07), (0, y0 - 0.25, ez + 0.12), mat=flat(teal, 0.55), bevel=0.01)
        ped = extrude('ped', [(-1.5, 0.0), (1.5, 0.0), (0.0, 0.78)], 0.62, rot=(90, 0, 0), top=flat(teal, 0.6),
                      side=flat(trim, 0.6), bevel=0.03)
        ped.location = (0, y0 + 0.06, ez + 0.3)
        for s in (-1, 1):
            ln = math.hypot(1.55, 0.8)
            ang = s * math.degrees(math.atan2(0.8, 1.55))
            box('pedr', (ln, 0.7, 0.1), (s * 0.77, y0 - 0.25, ez + 0.3 + 0.42), rot=(0, ang, 0), mat=flat(trim, 0.6),
                bevel=0.02, origin='center')
            sn = L.snow_slab('pedsn', ln * 0.85, 0.6, 0.06, (0, 0, 0), seed=93 + s)
            sn.location = (s * 0.74, y0 - 0.25, ez + 0.3 + 0.48)
            sn.rotation_euler = Euler((0, math.radians(ang), 0), 'XYZ')
        T.sign_disc('pedcoin', (0, y0 - 0.58, ez + 0.6), r=0.26, bg='#F2C14E', rim='#D9A93E', psi=0.0, tilt=0.0,
                    emblem=lambda s: T.em_pinecone(s * 0.62, col='#B47A2A'), es=1.0, snow=False)
        # big coin on the roof facing the camera
        with L.Collect() as rc:
            em_coin(1.25)
        L.group(BA.top_level(rc.objs), 'roofcoin', loc=(0.55, 0.85, H + 0.85), rot=(0, 0, T.CAM_PSI))
        for s in (-1, 1):
            cyl('rcleg', 0.04, 0.42, (0.55 + s * 0.22, 0.85 - s * 0.22, H + 0.05), mat=flat('#3D424C', 0.4, 0.6),
                segs=8)
        L.snow_slab('rcsnow', 0.5, 0.14, 0.06, (0.55, 0.85, H + 1.29), rot=(0, 0, T.CAM_PSI), seed=97)
        # piggy bracket sign on the front-right corner
        T.bracket_sign('psign', (x1, y0), z=PL + 2.6, arm=0.55, r=0.36, bg='#2F7D73', rim='#F2C14E',
                       emblem=lambda s: em_piggy(s * 0.8), es=1.0)
    # ------------------------------------------------------------------ dollhouse stubs
    with layer('shell_cut'):
        fr = CL.wall_x('stub_front', x0, x1, y0 + t / 2, PL, PL + B_STUB, t, plaster,
                       holes=[(door_x - 0.6, door_x + 0.6, PL - 0.01, PL + B_STUB + 0.1)])
        rt = CL.wall_y('stub_right', y0 + t, y1, x1 - t / 2, PL, PL + B_STUB, t, plaster)
        cap_strip('stubcap', fr + rt)
        box('stub_base', (x1 - x0 + 0.06, 0.04, 0.22), (0, y0 - 0.01, PL), mat=flat('#D9CBAE', 0.7), bevel=0.0)
        for k, x in enumerate((-1.08, -0.38, 0.38, 1.08)):
            cs = column('ccol%d' % k, x, y0 - 0.4, PL, 2.32, r=0.12)
            for o in cs[3:]:
                bpy.data.objects.remove(o, do_unlink=True)
            cs[2].scale.z = (B_STUB - 0.2) / (2.32 - 0.42)
            cyl('ccolcap', 0.115, 0.03, (x, y0 - 0.4, PL + B_STUB - 0.02), mat=flat(CL.CUT, 0.7), segs=24, bevel=0.0)
    # ------------------------------------------------------------------ markers
    mark('door', (door_x, y0 - 1.2, 0.0), facing=(0, 1, 0))
    mark('entry', (door_x, yi0 + 0.3, PL), facing=(0, 1, 0))
    for x in (0.12, 0.92, 1.72):
        mark('staff', (x, 0.98, PL), facing=(0, -1, 0))
    mark('staff', (mx - 0.5, my, PL), facing=(1, 0, 0))
    for x in (0.12, 0.92, 1.72):
        mark('counter', (x, 0.04, PL), facing=(0, 1, 0))
    for (x, y) in ((-0.05, -0.22), (-0.2, -0.58), (-0.35, -0.95)):
        mark('customer', (x, y, PL), facing=(0.3, 1, 0))
    for x in (0.95, 1.4, 1.85):
        mark('seat', (x, -0.42 - 0.21, PL + 0.45), facing=(0, -1, 0))
    mark('atm', (xi0 + 0.78, -0.98, PL), facing=(-1, 0, 0))
    mark('vault', (vcx + 0.15, vy0 - 0.75, PL), facing=(0, 1, 0))
    mark('desk', (mx + 0.55, my, PL), facing=(-1, 0, 0))
    return {'fx': {'sign': (0.55, 0.85, H + 0.85), 'display': (0.92, yi1 - 0.1, PL + 2.25),
                   'vault': (vcx, vy0, vcz), 'lamp': (x1 + 0.22, y0 - 0.62, 2.3)},
            'extra': {'floorLiftPx': int(round(PL * 55.4256)), 'stubM': B_STUB}}


# =========================================================================== RUINS

RUIN_NOTE = ('Burnt ruin for a %s plot (%g x %g m footprint, same anchor / footprint as site_*_%s and the %s '
             'buildings it replaces): %s. Charred but toy-like - fresh snow on the black beams, soot-stained snow on '
             'the ground, a few warm embers. %s_smoke = smoke-wisp overlay (same frame + anchor, anims.smoke 4 f '
             'loop, draw on top of the ruin while it smoulders). fxPoints.smoke = wisp bases (extra game FX), '
             'workPoints = where the demolition crew / excavator bucket works.')


def ruin_ground(name, a, seed=0, dark=0.9, r0=0.42, r1=0.8):
    """Soot-stained snow around the ruin: a thin disc whose soot fades to fully transparent at the rim (blends
    with any snow ground underneath)."""
    m = CL.soot_snow(r0=a * r0, r1=a * r1, dark=dark, scale=1.1 + 0.2 * (seed % 3), ash=True)
    return CL.ground_disc(name, a * (r1 + 0.04), a * (r1 + 0.04), m, loc=(0, 0, 0.0), t=0.008)


def charred_floor(name, w, d, x=0.0, y=0.0, seed=0):
    """Burnt floor boards inside the old foundation."""
    m = CL.charcoal(3.5, seed=seed, base='#4A403B', snow=0.0)
    return box(name, (w, d, 0.06), (x, y, 0.02), mat=m, bevel=0.02)


def stone_course(name, x0, x1, y0, y1, h=0.26, seed=0):
    """Sooty stone foundation ring (the old house outline)."""
    PA.stone_ring((x0 + x1) / 2, (y0 + y1) / 2, x1 - x0, y1 - y0, courses=1, h=h, seed=seed, stone_l=0.4,
                  depth=0.3, cols=('#6E6866', '#5E5856', '#7C7572', '#55504E'))


def mailbox(name, loc, col='#3D7CC9', lean=0.0, snow=True, flag=True):
    """Little round-topped mailbox on a post (survived the fire - only a bit sooty)."""
    x, y, z = loc
    objs = [box(name + '_post', (0.08, 0.08, 0.85), (0, 0, 0), mat=flat('#8A5A33', 0.7), bevel=0.015),
            box(name + '_box', (0.24, 0.42, 0.2), (0, 0, 0.85), mat=flat(col, 0.45), bevel=0.04),
            cyl(name + '_top', 0.12, 0.42, (0, 0, 1.05), rot=(90, 0, 0), mat=flat(col, 0.45), segs=20,
                origin='center', bevel=0.02),
            box(name + '_soot', (0.25, 0.2, 0.12), (0, 0.12, 0.88), mat=CL.scorched(col, 0.8, 1.0, amount=0.7),
                bevel=0.03)]
    if flag:
        objs.append(box(name + '_flag', (0.02, 0.05, 0.22), (0.13, 0.12, 0.95), mat=flat('#D9483B', 0.5),
                        bevel=0.005))
        objs.append(box(name + '_flagt', (0.02, 0.13, 0.07), (0.13, 0.08, 1.13), mat=flat('#D9483B', 0.5),
                        bevel=0.005))
    if snow:
        objs.append(PA.snow_cap(name + '_sn', 0.12, (0, 0.02, 1.16), h=0.05, seed=4, scale=(1.0, 1.6, 1.0)))
    g = L.group(objs, name, loc=loc)
    if lean:
        g.rotation_euler = Euler((0, math.radians(lean), math.radians(15)), 'XYZ')
    return g


def iron_stove(name, loc, s=1.0, kettle=True):
    x, y, z = loc
    im = flat('#3B3F47', 0.45, 0.55)
    objs = [box(name, (0.48 * s, 0.42 * s, 0.52 * s), (x, y, z + 0.1 * s), mat=im, bevel=0.05),
            box(name + '_top', (0.54 * s, 0.48 * s, 0.05 * s), (x, y, z + 0.62 * s), mat=flat('#2B2F3A', 0.4, 0.6),
                bevel=0.02),
            box(name + '_door', (0.2 * s, 0.03 * s, 0.18 * s), (x, y - 0.22 * s, z + 0.24 * s),
                mat=L.emissive(name + '_glow', '#FF9A3A', '#FF7A1A', 1.4), bevel=0.01),
            cyl(name + '_pipe', 0.06 * s, 0.75 * s, (x + 0.1 * s, y + 0.12 * s, z + 0.66 * s), mat=im, segs=12,
                bevel=0.01)]
    for sx in (-1, 1):
        for sy in (-1, 1):
            objs.append(cyl(name + '_leg', 0.035 * s, 0.12 * s, (x + sx * 0.18 * s, y + sy * 0.15 * s, z), mat=im,
                            segs=8))
    objs.append(PA.snow_cap(name + '_sn', 0.12 * s, (x - 0.12 * s, y + 0.06 * s, z + 0.68 * s), h=0.04, seed=3))
    if kettle:
        objs += CL.kettle(name + '_k', (x + 0.08 * s, y - 0.05 * s, z + 0.67 * s), col='#D9483B', s=s)
    return objs


def chimney_stack(name, x, y, h, w=0.46, col='#8E8682', seed=0):
    """Free-standing sooty stone chimney (the part that always survives)."""
    sm = L.brick(col, hexmix(col, '#000000', 0.18), '#B9B2AA', scale=3.2, row_h=0.35, snow_top=True)
    objs = [box(name, (w, w, h), (x, y, 0), mat=sm, bevel=0.03),
            box(name + '_soot', (w * 0.8, w + 0.004, h * 0.3), (x, y, h * 0.7), mat=CL.scorched(col, h * 0.6, h,
                                                                                             amount=1.0), bevel=0.0),
            box(name + '_cap', (w + 0.1, w + 0.1, 0.08), (x, y, h), mat=snowy('#4A4442', lo=0.7, hi=0.9), bevel=0.02),
            box(name + '_hole', (w * 0.55, w * 0.55, 0.02), (x, y, h + 0.08), mat=flat('#1E1A19', 0.9), bevel=0.0),
            PA.snow_cap(name + '_sn', w * 0.32, (x - 0.06, y + 0.04, h + 0.09), h=0.06, seed=seed)]
    return objs, (x, y, h + 0.15)


@civ('ruin_m', 'ruin', 'civ_ruins', fp=(3.0, 3.0), catcher=22.0, samples=40,
     notes=RUIN_NOTE % ('M', 3, 3, 'M', 'warehouse / cannery / shop / toolsmith / boathouse', 'a burnt log cottage - '
                        'the back and left log walls stand half high with jagged charred ends, two tall corner posts, '
                        'a fallen roof panel with a few red shingles left, the stone chimney and the iron stove (with '
                        'its red kettle!) survived, ash heaps and cinders', 'ruin_m'),
     ko='불탄 건물 (중)', en='Burnt ruin M', zone='ruins')
def b_ruin_m():
    a = 3.0
    rnd = L.rng(301)
    stone_course('found', -1.15, 1.15, -1.05, 1.1, seed=302)
    charred_floor('floor', 2.05, 1.95, 0.0, 0.03, seed=3)
    # back wall (+Y): stacked charred logs, jagged top
    r = 0.12
    lens = [2.3, 2.1, 1.7, 1.2, 0.7]
    for k, ln in enumerate(lens):
        x = -1.15 + ln / 2 + (0.0 if k % 2 == 0 else 0.05)
        log('blog%d' % k, r, ln, (x, 1.0, 0.28 + k * 0.22), rot=(0, 90, 0),
            bark=CL.charcoal(5.0, snow=0.3, seed=k, warm=0.5 if k == 1 else 0.0),
            end=CL.charcoal(9.0, seed=k + 9, base='#4A3A33'), segs=12)
    # left wall (-X): stacked logs, shorter toward the front
    lens = [2.1, 1.8, 1.3, 0.8]
    for k, ln in enumerate(lens):
        y = 1.05 - ln / 2
        log('llog%d' % k, r, ln, (-1.12, y, 0.39 + k * 0.22), rot=(90, 0, 0),
            bark=CL.charcoal(5.0, snow=0.3, seed=k + 20), end=CL.charcoal(9.0, seed=k + 29, base='#4A3A33'), segs=12)
    # front + right: just one or two log stubs
    log('flog', r, 1.1, (0.35, -1.0, 0.28), rot=(0, 90, 0), bark=CL.charcoal(5.0, snow=0.3, seed=40),
        end=CL.charcoal(9.0, seed=41, base='#4A3A33'), segs=12)
    log('rlog', r, 0.9, (1.12, 0.45, 0.28), rot=(90, 0, 0), bark=CL.charcoal(5.0, snow=0.3, seed=42),
        end=CL.charcoal(9.0, seed=43, base='#4A3A33'), segs=12)
    CL.charred_post('post0', -1.15, 1.02, 2.2, seed=1)
    CL.charred_post('post1', 1.12, 1.02, 1.55, seed=2, lean=(0, 6))
    CL.charred_post('post2', 1.12, -1.0, 0.95, seed=3, lean=(-8, 0))
    # fallen roof panel leaning from the back wall into the room, a few red shingles left on it
    rp = box('roofp', (1.6, 1.4, 0.08), (0, 0, 0), mat=CL.charcoal(4.0, snow=0.15, seed=50), bevel=0.03,
             origin='center')
    rp.location = (0.15, 0.32, 0.66)
    rp.rotation_euler = Euler((math.radians(-30), math.radians(6), math.radians(8)), 'XYZ')
    shm = [flat('#C8473A', 0.7), flat('#A83A30', 0.7)]
    for k in range(13):
        row, col = k // 4, k % 4
        if rnd.random() < 0.18:
            continue
        sh = box('shingle', (0.34, 0.24, 0.03), (0, 0, 0), mat=shm[(k * 7) % 2], bevel=0.012, origin='center')
        sh.parent = rp
        sh.location = (-0.58 + 0.38 * col + 0.1 * (row % 2) + rnd.uniform(-0.03, 0.03), -0.5 + 0.3 * row, 0.055)
        sh.rotation_euler = Euler((0, 0, math.radians(rnd.uniform(-10, 10))), 'XYZ')
    rsn = L.snow_slab('roofsn', 0.7, 0.4, 0.05, (0, 0, 0), seed=51)
    rsn.parent = rp
    rsn.location = (0.35, 0.45, 0.06)
    # beams crossing the room
    CL.charred_beam('beam0', (-0.95, -0.55, 0.08), (0.75, 0.6, 0.55), r=0.075, seed=60)
    CL.charred_beam('beam1', (0.4, -0.85, 0.08), (1.05, 0.2, 0.42), r=0.07, seed=61, warm=3.0)
    CL.embers('emb0', (0.45, -0.3, 0.32), 0.18, 7, seed=15)
    CL.embers('emb1', (-0.62, -0.55, 0.26), 0.12, 4, seed=16)
    mailbox('mbox', (-1.45, -1.3, 0.0), col='#3D7CC9', lean=-8)
    CL.charred_beam('beam2', (-0.6, 0.85, 1.05), (-0.95, -0.2, 0.1), r=0.07, seed=62)
    # chimney (back-left) + stove survived
    objs, top = chimney_stack('chim', -0.55, 1.28, 2.75, seed=5)
    iron_stove('stove', (-0.55, 0.62, 0.05), s=1.0)
    CL.ash_mound('ash0', 0.38, (0.45, -0.3, 0.05), seed=7)
    CL.ash_mound('ash1', 0.28, (-0.6, -0.55, 0.05), seed=8, snow=0.3)
    CL.ash_mound('ash2', 0.22, (0.95, 0.7, 0.05), seed=9)
    CL.cinder_bits('cinders', (0.1, -0.1), 1.1, 30, seed=10, z=0.05)
    CL.bricks('bricks', (-0.85, -0.85), 0.35, 6, seed=11, col='#8E8682', soot=0.6, z=0.02)
    CL.plank_scatter('planks', (0.6, -0.95), 0.4, 3, seed=12, cols=(CL.CHAR, '#8A5A33', CL.CHAR_LIGHT))
    LA.snow_drift('d0', 0.3, (-1.45, -1.25, 0.0), seed=13)
    LA.snow_drift('d1', 0.24, (1.4, 1.35, 0.0), seed=14)
    # smoke wisps (overlay)
    bases = [(0.45, -0.3, 0.3), (1.0, 0.0, 0.45), (-0.55, 1.28, 2.85)]
    sm, set_sm = CL.smoke_wisps('wisp', bases, seed=3, rise=1.5)
    CL.overlay('smoke', [o for s in sm for o in s.obs], lambda i: set_sm(i, 4), 4, fps=6, repeat=-1)
    for b in bases:
        CL.bounds_marker('wb', (b[0] + 0.5, b[1] + 0.2, b[2] + 1.55))
    mark('work', (-0.3, -1.85, 0.0), facing=(0, 1, 0))
    mark('work', (1.85, 0.2, 0.0), facing=(-1, 0, 0))
    mark('work', (0.7, -1.8, 0.0), facing=(0, 1, 0))
    return {'fx': {'smoke': (0.45, -0.3, 0.3), 'smoke2': (1.0, 0.0, 0.45), 'chimney': top, 'ember': (0.75, -0.3, 0.3)}}


# =========================================================================== POLICE STATION (cutaway)

POLICE_NOTE = ('Police station "솔방울 경찰서" (6.4 x 4.6 m footprint incl. the car bay): white-and-navy clapboard '
               'station with a slate-blue gable roof, a red/blue light bar on the ridge, a gold star badge sign, a '
               'blue police lamp over the double door and a painted car bay on its right side for the police_car. '
               'CUTAWAY like the bank: police_station_floor (wood floor, rugs, car bay, ground shadow), _back (far '
               'walls from inside: notice board, town map, clock, windows, the cell\'s barred window), _interior '
               '(the cosy cell: cot with a patchwork quilt, teddy, cocoa, flower; stove with kettle, filing cabinet, '
               'coat hooks, visitor bench, plants), _front (reception desk + the cell bars = what stands in front of '
               '\'behind\' characters), police_station_cell (barred cell door overlay: anims.open 6 f, close '
               'reverses; draw it AFTER the behind slot because the prisoner is inside), _shell_cut, _shell. '
               'staffPoints = desk officer + filing officer (behind slot), customerPoints = visitor at the desk '
               '(+ one waiting), cellPoints = prisoner spots inside the cell (behind slot), cellSeatPoint = sitting '
               'on the cot, cellDoorPoint = just outside the cell door, carBayPoint + carBayDir = where the '
               'police_car parks (nose out, SW), sideDoorPoint = staff door to the car bay, doorPoint / entryPoint.')

P_X0, P_X1, P_Y0, P_Y1 = -3.1, 0.9, -1.4, 1.8
P_T, P_PL, P_H = 0.16, 0.22, 2.84
P_STUB = 0.55


def quilt_mat():
    key = ('civ_quilt',)
    if key in L._CUSTOM:
        return L._CUSTOM[key]
    nb = L.NB('quilt', rough=0.9)
    tc = nb.n('ShaderNodeTexCoord')
    ch = nb.n('ShaderNodeTexChecker')
    ch.inputs['Color1'].default_value = nb.rgb('#E8749A')
    ch.inputs['Color2'].default_value = nb.rgb('#F2C14E')
    ch.inputs['Scale'].default_value = 7.0
    nb.link(tc.outputs['Object'], ch.inputs['Vector'])
    ch2 = nb.n('ShaderNodeTexChecker')
    ch2.inputs['Color1'].default_value = nb.rgb('#5FA7D9')
    ch2.inputs['Color2'].default_value = nb.rgb('#F4F1EA')
    ch2.inputs['Scale'].default_value = 3.5
    nb.link(tc.outputs['Object'], ch2.inputs['Vector'])
    f = ch2.outputs['Fac']
    nb.base(nb.mix_rgb(f, ch.outputs['Color'], ch2.outputs['Color']))
    L._CUSTOM[key] = nb.m
    return nb.m


def teddy(name, loc, s=1.0, rot_z=0.0, col='#B9783F'):
    fm = flat(col, 0.85)
    lm = flat('#E9C9A0', 0.85)
    objs = [sphere(name + '_b', 0.11 * s, (0, 0, 0.11 * s), fm, scale=(1, 0.9, 1.05), segs=16, rings=10),
            sphere(name + '_h', 0.085 * s, (0, -0.01 * s, 0.27 * s), fm, segs=16, rings=10),
            sphere(name + '_m', 0.035 * s, (0, -0.08 * s, 0.25 * s), lm, scale=(1.2, 0.8, 0.9), segs=10, rings=6),
            sphere(name + '_n', 0.014 * s, (0, -0.11 * s, 0.265 * s), flat('#2B2F3A', 0.4), segs=8, rings=5)]
    for sx in (-1, 1):
        objs.append(sphere(name + '_e', 0.035 * s, (sx * 0.065 * s, 0.0, 0.34 * s), fm, segs=10, rings=6))
        objs.append(sphere(name + '_eye', 0.012 * s, (sx * 0.03 * s, -0.075 * s, 0.29 * s), flat('#2B2F3A', 0.3),
                           segs=8, rings=5))
        objs.append(sphere(name + '_arm', 0.04 * s, (sx * 0.11 * s, -0.03 * s, 0.13 * s), fm, scale=(0.8, 0.8, 1.3),
                           segs=10, rings=6))
        objs.append(sphere(name + '_leg', 0.045 * s, (sx * 0.06 * s, -0.08 * s, 0.03 * s), fm, scale=(0.9, 1.3, 0.8),
                           segs=10, rings=6))
    objs.append(sphere(name + '_bow', 0.03 * s, (0, -0.07 * s, 0.2 * s), flat('#D9483B', 0.5), scale=(1.6, 0.6, 0.8),
                       segs=10, rings=6))
    return L.group(objs, name, loc=loc, rot=(0, 0, rot_z))


def bars_x(name, x0, x1, y, z0, z1, mat, step=0.13, r=0.022):
    """Row of vertical cell bars along X + top/bottom rails (one batched object)."""
    mb = L.MB()
    n = max(2, int(round((x1 - x0) / step)))
    for k in range(n + 1):
        x = x0 + (x1 - x0) * k / n
        mb.seg(Vector((x, y, z0)), Vector((x, y, z1)), r, mat, segs=8)
    for z in (z0 + 0.03, z0 + 1.0, z1):
        mb.seg(Vector((x0, y, z)), Vector((x1, y, z)), r * 1.5, mat, segs=8)
    return mb.done(name)


def bars_y(name, y0, y1, x, z0, z1, mat, step=0.13, r=0.022):
    mb = L.MB()
    n = max(2, int(round((y1 - y0) / step)))
    for k in range(n + 1):
        y = y0 + (y1 - y0) * k / n
        mb.seg(Vector((x, y, z0)), Vector((x, y, z1)), r, mat, segs=8)
    for z in (z0 + 0.03, z0 + 1.0, z1):
        mb.seg(Vector((x, y0, z)), Vector((x, y1, z)), r * 1.5, mat, segs=8)
    return mb.done(name)


def police_lamp(name, loc, face='y-'):
    """Classic blue police lamp on a bracket over the door."""
    lm = L.emissive(name + '_g', '#7FB2FF', '#8FC0FF', 2.4)
    objs = [box(name + '_arm', (0.04, 0.32, 0.04), (0, -0.16, 0.12), mat=flat('#2B2F3A', 0.4, 0.5), bevel=0.01),
            box(name + '_box', (0.2, 0.2, 0.24), (0, -0.32, -0.1), mat=lm, bevel=0.03),
            box(name + '_cap', (0.26, 0.26, 0.06), (0, -0.32, 0.14), mat=flat('#2E4F8A', 0.4), bevel=0.02),
            sphere(name + '_knob', 0.04, (0, -0.32, 0.22), flat('#F2C14E', 0.3, 0.7), segs=10, rings=6),
            box(name + '_base', (0.22, 0.22, 0.04), (0, -0.32, -0.12), mat=flat('#2E4F8A', 0.4), bevel=0.01)]
    return T.face_group(objs, face, loc, name)


@civ('police_station', 'building', 'civ_police', fp=(6.4, 4.6), catcher=32.0, samples=48, notes=POLICE_NOTE,
     ko='경찰서', en='Police station', zone='police', cutaway=True)
def b_police_station():
    x0, x1, y0, y1, t, PL, H = P_X0, P_X1, P_Y0, P_Y1, P_T, P_PL, P_H
    xi0, xi1, yi0, yi1 = x0 + t, x1 - t, y0 + t, y1 - t
    navy, white, slate = '#2E4F8A', '#F2EEE6', '#33507A'
    door_x = -0.55
    sdoor_y = 0.95
    cx1, cy0 = -1.62, 0.3                    # cell: x in [xi0, cx1], y in [cy0, yi1]
    # ------------------------------------------------------------------ floor
    with layer('floor'):
        box('plinth', (x1 - x0 + 0.12, y1 - y0 + 0.12, PL), ((x0 + x1) / 2, (y0 + y1) / 2, 0),
            mat=snowy('#8E96A3', lo=0.78, hi=0.9), bevel=0.04)
        box('floorwood', (cx1 - xi0 + 0.0 + (xi1 - cx1), yi1 - yi0, 0.02), ((xi0 + xi1) / 2, (yi0 + yi1) / 2, PL - 0.005),
            mat=L.stripes('#D39A5E', '#C08A50', 5.0, 'X', rough=0.7, soft=0.05), bevel=0.0)
        box('cellfloor', (cx1 - xi0, yi1 - cy0, 0.024), ((xi0 + cx1) / 2, (cy0 + yi1) / 2, PL - 0.004),
            mat=tiles_mat('#C9CFD8', '#AEB6C2', 3.2), bevel=0.0)
        cyl('rug', 0.55, 0.012, (-0.55, -0.55, PL + 0.02), mat=flat('#3D7CC9', 0.9), segs=36, bevel=0.0)
        cyl('rug2', 0.44, 0.014, (-0.55, -0.55, PL + 0.02), mat=flat('#F2C14E', 0.9), segs=36, bevel=0.0)
        cyl('rug3', 0.36, 0.016, (-0.55, -0.55, PL + 0.02), mat=flat('#3D7CC9', 0.9), segs=36, bevel=0.0)
        box('cellrug', (0.55, 0.75, 0.012), (xi0 + 1.0, 1.0, PL + 0.02), mat=flat('#C0392B', 0.9), bevel=0.0)
        box('step', (1.3, 0.45, PL * 0.6), (door_x, y0 - 0.23, 0), mat=snowy('#8E96A3', lo=0.6, hi=0.8), bevel=0.03)
        box('sstep', (0.42, 0.9, PL * 0.6), (x1 + 0.21, sdoor_y, 0), mat=snowy('#8E96A3', lo=0.6, hi=0.8),
            bevel=0.03)
        # car bay: asphalt pad, stall lines, painted star, cone, P sign
        bx0, bx1, by0, by1 = 1.08, 3.14, -2.18, 2.18
        box('bay', (bx1 - bx0, by1 - by0, 0.03), ((bx0 + bx1) / 2, 0.0, 0.0), mat=tonal('#6E7480', 0.06, 2.0),
            bevel=0.02)
        lm = flat('#F4F1EA', 0.7)
        for x in (bx0 + 0.1, bx1 - 0.1):
            box('bayline', (0.07, by1 - by0 - 0.3, 0.008), (x, 0.0, 0.03), mat=lm, bevel=0.0)
        box('bayline2', (bx1 - bx0 - 0.2, 0.07, 0.008), ((bx0 + bx1) / 2, by1 - 0.2, 0.03), mat=lm, bevel=0.0)
        star = extrude('baystar', [(x * 0.42, y * 0.42) for x, y in T.star_pts(1.0, 0.45)], 0.006,
                       top=flat('#3D7CC9', 0.6), side=flat('#3D7CC9', 0.6), bevel=0.0)
        star.location = ((bx0 + bx1) / 2, 0.9, 0.032)
        for k, (x, y) in enumerate(((bx1 - 0.25, by0 + 0.3), (bx0 + 0.3, by0 + 0.25))):
            cyl('cone', 0.13, 0.42, (x, y, 0.03), mat=flat('#EE7F33', 0.5), r_top=0.025, segs=16, bevel=0.01)
            cyl('coneb', 0.09, 0.06, (x, y, 0.17), mat=flat('#F4F1EA', 0.5), r_top=0.075, segs=16, bevel=0.0)
            box('conebase', (0.3, 0.3, 0.04), (x, y, 0.0), mat=flat('#EE7F33', 0.5), bevel=0.01)
        T.post_sign('psign', (bx1 + 0.05, by1 - 0.25, 0.0), h=1.7, r=0.24, bg='#3D7CC9', rim='#F4F1EA',
                    emblem=lambda s: T.em_star(s * 0.7), es=1.0)
        T.flower_tub('tub0', (x0 - 0.05, y0 - 0.4, 0.0), r=0.22, col=navy, evergreen=True, seed=51)
        T.flower_tub('tub1', (door_x + 0.95, y0 - 0.38, 0.0), r=0.2, col=navy, seed=52)
        for k, (x, y, r) in enumerate(((x0 - 0.2, y1 + 0.05, 0.3), (bx1 + 0.15, by0 + 1.2, 0.24),
                                      (x1 - 0.2, y1 + 0.2, 0.22))):
            LA.snow_drift('drift%d' % k, r, (x, y, 0.0), seed=160 + k)
    # ------------------------------------------------------------------ back walls (from inside)
    paper = L.stripes('#E6ECF4', '#D6DFEB', 9.0, 'X', rough=0.85, soft=0.12)
    paper_y = L.stripes('#E6ECF4', '#D6DFEB', 9.0, 'Y', rough=0.85, soft=0.12)
    with layer('back'):
        bw = CL.wall_x('wall_back', x0, x1, y1 - t / 2, PL, H, t, paper)
        lw = CL.wall_y('wall_left', y0, y1 - t, x0 + t / 2, PL, H, t, paper_y)
        cap_strip('wcap', bw + lw)
        CL.wainscot('wsb', xi0, xi1, yi1, 0.85, face='y-', col='#2E4F8A', cap='#F2EEE6', z0=PL)
        CL.wainscot('wsl', yi0, yi1, xi0, 0.85, face='x+', col='#2E4F8A', cap='#F2EEE6', z0=PL)
        inner_window('bwin0', (0.15, yi1, PL + 2.2), 'y-', w=0.5, h=0.75, curtain='#3D7CC9', seed=11)
        # the cell's little barred window with a cheerful curtain
        inner_window('cwin', (-2.3, yi1, PL + 2.15), 'y-', w=0.42, h=0.5, curtain='#E8749A', seed=12)
        cb = []
        for k in range(4):
            cb.append(cyl('cwbar', 0.016, 0.52, (-0.15 + 0.1 * k, -0.12, -0.51), mat=CL.iron(), segs=8))
        T.face_group(cb, 'y-', (-2.3, yi1, PL + 2.15), 'cwbars')
        # notice board with papers + a mug-shot frame, clock above
        nb_ = [box('nb', (0.9, 0.05, 0.62), (0, -0.025, -0.31), mat=flat('#C9A06B', 0.9), bevel=0.02),
               box('nbf', (0.98, 0.04, 0.7), (0, -0.005, -0.31), mat=flat('#7A4E2E', 0.6), bevel=0.02)]
        rnd = L.rng(171)
        for k in range(6):
            col = ['#F4F1EA', '#FFF3B0', '#CFE6F5', '#F4F1EA', '#F8D7DD', '#F4F1EA'][k]
            nb_.append(box('np', (0.2, 0.012, 0.24), (-0.3 + 0.2 * (k % 4) + rnd.uniform(-0.03, 0.03), -0.055,
                                                       -0.18 - 0.28 * (k // 4) - (0.04 if k % 2 else 0.0)),
                           rot=(0, rnd.uniform(-8, 8), 0), mat=flat(col, 0.8), bevel=0.0))
            nb_.append(sphere('npin', 0.018, (-0.3 + 0.2 * (k % 4), -0.065, -0.08 - 0.28 * (k // 4)),
                              flat(['#D9483B', '#3D7CC9'][k % 2], 0.4), segs=8, rings=5))
        T.face_group(nb_, 'y-', (-0.75, yi1, PL + 1.95), 'noticeboard')
        CL.wall_clock('clock', (-0.75, yi1, PL + 2.32), 'y-', r=0.16)
        # town map (framed) on the left wall above the bench + coat hooks with police caps

        def map_pic(objs, w, h):
            objs.append(box('mland', (w * 0.85, 0.01, h * 0.8), (0, -0.058, 0.0), mat=flat('#BFE3B5', 0.8),
                            bevel=0.0))
            objs.append(box('mroad', (w * 0.85, 0.012, 0.03), (0, -0.062, 0.02), mat=flat('#F4F1EA', 0.8), bevel=0.0))
            objs.append(box('mroad2', (0.03, 0.012, h * 0.8), (0.05, -0.062, 0.0), mat=flat('#F4F1EA', 0.8),
                            bevel=0.0))
            objs.append(sphere('mpin', 0.03, (0.12, -0.07, 0.08), flat('#D9483B', 0.4), segs=8, rings=5))
        CL.picture_frame('map', (xi0, -0.65, PL + 1.75), 'x+', w=0.7, h=0.48, pic=map_pic, frame_col='#7A4E2E')
        hooks = [box('hrail', (0.7, 0.05, 0.08), (0, -0.025, 0), mat=flat('#7A4E2E', 0.6), bevel=0.015)]
        for k, dx in enumerate((-0.2, 0.2)):
            hooks.append(cyl('hcap', 0.11, 0.08, (dx, -0.13, -0.02), mat=flat(navy, 0.5), segs=16, r_top=0.12,
                             bevel=0.02))
            hooks.append(cyl('hpeak', 0.1, 0.02, (dx, -0.18, -0.06), rot=(-20, 0, 0), mat=flat('#1E2230', 0.4),
                             segs=16, bevel=0.0))
            hooks.append(sphere('hbadge', 0.025, (dx, -0.24, 0.0), CL.gold(), segs=8, rings=5))
        T.face_group(hooks, 'x+', (xi0, 0.05, PL + 1.6), 'hooks')
        wall_lamp_in('sc0', (0.55, yi1, PL + 1.8), 'y-')
        wall_lamp_in('sc1', (xi0, -1.05, PL + 2.05), 'x+')
    # ------------------------------------------------------------------ interior
    with layer('interior'):
        # the cosy cell: cot with a patchwork quilt, pillow + teddy, cocoa, flower, rug
        bx_, by_ = xi0 + 0.38, 1.05
        box('cot', (0.66, 1.15, 0.3), (bx_, by_, PL + 0.12), mat=flat('#8A5A33', 0.6), bevel=0.03)
        for sx in (-1, 1):
            for sy in (-1, 1):
                cyl('cotleg', 0.03, 0.14, (bx_ + sx * 0.28, by_ + sy * 0.52, PL), mat=flat('#5E3A22', 0.6), segs=8)
        box('mattress', (0.62, 1.1, 0.1), (bx_, by_, PL + 0.42), mat=flat('#F4F1EA', 0.8), bevel=0.04)
        box('quilt', (0.66, 0.78, 0.07), (bx_ + 0.01, by_ - 0.15, PL + 0.5), mat=quilt_mat(), bevel=0.04)
        sphere('pillow', 0.15, (bx_, by_ + 0.38, PL + 0.58), flat('#F4F1EA', 0.8), scale=(1.7, 1.0, 0.55), segs=16,
               rings=8)
        teddy('teddy', (bx_ + 0.05, by_ + 0.32, PL + 0.6), s=1.0, rot_z=40)
        box('ctable', (0.3, 0.3, 0.42), (cx1 - 0.3, yi1 - 0.25, PL), mat=flat('#C98F55', 0.6), bevel=0.03)
        cyl('mug', 0.045, 0.09, (cx1 - 0.35, yi1 - 0.25, PL + 0.42), mat=flat('#D9483B', 0.4), segs=14, bevel=0.01)
        cyl('cocoa', 0.04, 0.005, (cx1 - 0.35, yi1 - 0.25, PL + 0.505), mat=flat('#7A4A2A', 0.4), segs=14, bevel=0.0)
        CL.potted_plant('cflower', (cx1 - 0.22, yi1 - 0.25, PL + 0.42), s=0.55, pot='#E8749A', leaf='#3E8E57',
                        seed=12)
        box('book', (0.16, 0.22, 0.04), (bx_ + 0.12, by_ - 0.3, PL + 0.56), rot=(0, 0, 15), mat=flat('#3D7CC9', 0.6),
            bevel=0.01)
        # stove with a kettle (warm corner), filing cabinet, water cooler, coat stand, bench, plants
        sx_, sy_ = -1.05, yi1 - 0.3
        box('stove', (0.46, 0.42, 0.55), (sx_, sy_, PL + 0.08), mat=flat('#3B3F47', 0.45, 0.5), bevel=0.05)
        box('stovetop', (0.5, 0.46, 0.04), (sx_, sy_, PL + 0.63), mat=flat('#2B2F3A', 0.4, 0.6), bevel=0.015)
        box('stovedoor', (0.2, 0.03, 0.16), (sx_, sy_ - 0.22, PL + 0.25), mat=L.emissive('stoveglow', '#FF9A3A',
                                                                                      '#FF7A1A', 1.6), bevel=0.01)
        cyl('stovepipe', 0.06, H - PL - 0.65, (sx_, sy_ + 0.1, PL + 0.66), mat=flat('#3B3F47', 0.45, 0.5), segs=12)
        for ssx in (-1, 1):
            for ssy in (-1, 1):
                cyl('stoveleg', 0.03, 0.08, (sx_ + ssx * 0.18, sy_ + ssy * 0.15, PL), mat=flat('#2B2F3A', 0.5),
                    segs=8)
        CL.kettle('kettle', (sx_ - 0.08, sy_ - 0.05, PL + 0.67), col='#3D7CC9')
        L.point_light('stovel', (sx_, sy_ - 0.45, PL + 0.35), 'glow', 6.0, 0.1)
        fcx = 0.42
        box('filing', (0.46, 0.44, 1.25), (fcx, yi1 - 0.24, PL), mat=flat('#7FA08A', 0.5), bevel=0.03)
        for k in range(3):
            box('fdrawer', (0.38, 0.03, 0.32), (fcx, yi1 - 0.47, PL + 0.12 + 0.4 * k), mat=flat('#8FB39A', 0.5),
                bevel=0.01)
            box('fhandle', (0.12, 0.03, 0.03), (fcx, yi1 - 0.49, PL + 0.36 + 0.4 * k), mat=CL.brass(), bevel=0.005)
        box('fbox', (0.3, 0.26, 0.12), (fcx, yi1 - 0.24, PL + 1.25), mat=flat('#C9A36B', 0.85), bevel=0.02)
        # visitor bench against the left wall (faces +X)
        bench_x = xi0 + 0.27
        box('bseat', (0.4, 1.05, 0.07), (bench_x, -0.62, PL + 0.38), mat=flat('#C98F55', 0.6), bevel=0.02)
        box('bback', (0.07, 1.05, 0.45), (xi0 + 0.08, -0.62, PL + 0.45), mat=flat('#C98F55', 0.6), bevel=0.02)
        for sy in (-1, 1):
            box('bleg', (0.36, 0.05, 0.38), (bench_x, -0.62 + sy * 0.46, PL), mat=flat('#7A4E2E', 0.6), bevel=0.01)
        CL.potted_plant('plant0', (xi1 - 0.22, yi0 + 0.22, PL), s=1.0, seed=13, pot=navy)
        cyl('coatst', 0.025, 1.55, (-1.35, -0.98, PL), mat=flat('#7A4E2E', 0.6), segs=8)
        cyl('coatft', 0.15, 0.04, (-1.35, -0.98, PL), mat=flat('#7A4E2E', 0.6), segs=14)
        blob('coat', 0.15, (-1.33, -0.98, PL + 1.2), flat(navy, 0.8), scale=(0.8, 0.9, 1.8), seed=9, amp=0.08,
             subdiv=2)
        blob('scarf', 0.08, (-1.33, -1.02, PL + 1.45), flat('#D9483B', 0.8), scale=(1.4, 1.0, 0.6), seed=10,
             amp=0.1, subdiv=2)
        # desk chair (desk itself is in 'front')
        box('dchair', (0.44, 0.42, 0.1), (door_x, 0.5, PL + 0.4), mat=flat(navy, 0.6), bevel=0.04)
        box('dchairb', (0.46, 0.1, 0.55), (door_x, 0.72, PL + 0.46), mat=flat(navy, 0.6), bevel=0.05)
        cyl('dchairp', 0.03, 0.4, (door_x, 0.5, PL), mat=flat('#2B2F3A', 0.5), segs=8)
        L.point_light('in_l1', (-0.6, 0.3, PL + 2.3), 'window', 26.0, 0.3)
        L.point_light('in_l2', (-2.2, 0.9, PL + 2.2), 'window', 14.0, 0.3)
    # ------------------------------------------------------------------ front occluders: desk + cell bars
    iron_m = flat('#4A5563', 0.35, 0.6)
    cdx0, cdx1 = -2.14, -1.66                  # cell door opening in the front bar line
    with layer('front'):
        dw = flat('#7A4E2E', 0.55)
        box('desk', (1.4, 0.5, 0.82), (door_x, 0.02, PL), mat=dw, bevel=0.03)
        box('desktop', (1.48, 0.58, 0.05), (door_x, 0.02, PL + 0.82), mat=flat('#C98F55', 0.5), bevel=0.015)
        box('deskpanel', (1.2, 0.03, 0.5), (door_x, -0.24, PL + 0.18), mat=flat(navy, 0.55), bevel=0.01)
        sg = [cyl('dstar_b', 0.17, 0.03, (0, 0, 0), rot=(90, 0, 0), mat=flat(navy, 0.5), segs=24, origin='center',
                  bevel=0.008)]
        st_ = T.ext_xz('dstar', T.star_pts(0.13, 0.06), 0.03, CL.gold(), y=-0.02, bevel=0.006)
        sg.append(st_)
        L.group(sg, 'deskstar', loc=(door_x, -0.27, PL + 0.43))
        # desk things: phone, lamp, papers, donut box, mug, bell
        box('phone', (0.18, 0.12, 0.07), (door_x - 0.48, 0.05, PL + 0.87), mat=flat('#D9483B', 0.4), bevel=0.025)
        cyl('handset', 0.03, 0.2, (door_x - 0.48, 0.05, PL + 0.97), rot=(0, 90, 0), mat=flat('#D9483B', 0.4),
            segs=10, origin='center', bevel=0.01)
        box('papers', (0.26, 0.2, 0.03), (door_x - 0.12, 0.08, PL + 0.87), rot=(0, 0, -8), mat=flat('#F4F1EA', 0.7),
            bevel=0.005)
        box('donutbox', (0.3, 0.22, 0.05), (door_x + 0.28, 0.06, PL + 0.87), mat=flat('#F8D7DD', 0.7), bevel=0.01)
        for k in range(3):
            cyl('donut', 0.05, 0.035, (door_x + 0.19 + 0.09 * k, 0.06, PL + 0.92), mat=flat(['#E8749A', '#C9853F',
                                                                                            '#F2C14E'][k], 0.5),
                segs=14, bevel=0.012)
        cyl('dmug', 0.04, 0.09, (door_x + 0.55, 0.12, PL + 0.87), mat=flat('#3D7CC9', 0.4), segs=14, bevel=0.01)
        sphere('dbell', 0.05, (door_x + 0.1, -0.15, PL + 0.89), CL.gold(), scale=(1, 1, 0.7), segs=12, rings=8)
        cyl('dlampp', 0.02, 0.32, (door_x + 0.55, -0.1, PL + 0.87), mat=CL.brass(), segs=8)
        cyl('dlamps', 0.07, 0.1, (door_x + 0.55, -0.13, PL + 1.15), rot=(-20, 0, 0),
            mat=L.emissive('dlamp', '#3E8E57', '#FFE7B0', 1.2), segs=14, r_top=0.11)
        # cell bars (front line with the door gap + right side)
        zb0, zb1 = PL, PL + 2.05
        bars_x('bars_f1', xi0, cdx0, cy0, zb0, zb1, iron_m)
        bars_y('bars_r', cy0, yi1, cx1, zb0, zb1, iron_m)
        for x in (cdx0, cdx1):
            box('cdpost', (0.07, 0.07, zb1 - zb0), (x, cy0, zb0), mat=iron_m, bevel=0.01)
        box('cdtop', (cdx1 - cdx0 + 0.07, 0.08, 0.1), ((cdx0 + cdx1) / 2, cy0, zb1 - 0.05), mat=iron_m, bevel=0.01)
        box('cornerpost', (0.08, 0.08, zb1 - zb0), (cx1, cy0, zb0), mat=iron_m, bevel=0.01)
        sphere('cknob', 0.05, (cx1, cy0, zb1 + 0.05), CL.gold(), segs=10, rings=6)
    # ------------------------------------------------------------------ cell door (overlay)
    with layer('cell'):
        with L.Collect() as dc:
            door_w = cdx1 - cdx0 - 0.04
            bars_x('cd_bars', -door_w, 0.0, 0.0, zb0 + 0.04, zb1 - 0.14, iron_m, step=0.12)
            box('cd_frame', (0.05, 0.05, zb1 - zb0 - 0.18), (-door_w, 0, zb0 + 0.04), mat=iron_m, bevel=0.01)
            box('cd_lock', (0.12, 0.08, 0.16), (-door_w + 0.04, -0.03, zb0 + 0.95), mat=CL.brass(), bevel=0.02)
            sphere('cd_heart', 0.04, (-door_w / 2, -0.03, zb0 + 1.5), flat('#E8749A', 0.4), scale=(1, 0.4, 1),
                   segs=10, rings=6)
        cdg = L.group(BA.top_level(dc.objs), 'cell_door', loc=(cdx1 - 0.02, cy0, 0))

    def cell_set(i):
        cdg.rotation_euler = Euler((0, 0, math.radians([0, 18, 40, 62, 82, 95][i])), 'XYZ')
    cell_set(0)
    CL.overlay('cell', [cdg], cell_set, 6, fps=10, repeat=0, extra={'drawAfter': 'behind', 'name': 'open',
                                                                   'reverse': 'close'})
    CL.bounds_marker('cb', (cdx1 - 0.02, cy0 - 0.5, zb1))
    # ------------------------------------------------------------------ shell (closed building)
    plaster = T.plaster(white)
    clap = L.stripes(navy, hexmix(navy, '#000000', 0.15), 5.5, 'Z', rough=0.6, soft=0.05)
    zb = PL + 1.0
    with layer('shell'):
        box('wfront_lo', (x1 - x0, t, zb - PL), ((x0 + x1) / 2, y0 + t / 2, PL), mat=clap, bevel=0.0)
        box('wfront_hi', (x1 - x0, t, H - zb), ((x0 + x1) / 2, y0 + t / 2, zb), mat=plaster, bevel=0.0)
        box('wright_lo', (t, y1 - y0 - t, zb - PL), (x1 - t / 2, (y0 + y1) / 2 + t / 2, PL), mat=clap, bevel=0.0)
        box('wright_hi', (t, y1 - y0 - t, H - zb), (x1 - t / 2, (y0 + y1) / 2 + t / 2, zb), mat=plaster, bevel=0.0)
        T.corner_trims('ctrim', x1 - x0, y1 - y0, PL, H - PL, white, x=(x0 + x1) / 2, y=(y0 + y1) / 2, t=0.17)
        T.band('band', x1 - x0, y1 - y0, zb - 0.04, white, h=0.09, x=(x0 + x1) / 2, y=(y0 + y1) / 2, snow=True,
               seed=181)
        T.band('cornice', x1 - x0, y1 - y0, H - 0.12, white, h=0.13, out=0.06, x=(x0 + x1) / 2, y=(y0 + y1) / 2)
        T.gable('roof', x1 - x0, y1 - y0, H, H + 1.2, 0.3, slate, plaster, seed=182, x=(x0 + x1) / 2,
                y=(y0 + y1) / 2, along='x')
        T.door('door', (door_x, y0, PL), 'y-', w=0.92, h=1.6, col='#3D7CC9', frame_col=white, double=True,
               step=False, canopy=(0.55, PL + 1.82), canopy_col=navy)
        police_lamp('plamp', (door_x, y0, PL + 2.2), 'y-')
        for k, x in enumerate((-2.45, -1.6, 0.35)):
            T.win('fw%d' % k, (x, y0, PL + 1.95), 'y-', w=0.5, h=0.62, shutters=navy, frame=white, seed=190 + k)
            box('fbox%d' % k, (0.6, 0.16, 0.13), (x, y0 - 0.09, PL + 1.17), mat=flat('#7A4E2E', 0.8), bevel=0.03)
            for j in range(4):
                sphere('fbl', 0.05, (x - 0.2 + 0.13 * j, y0 - 0.09, PL + 1.34),
                       flat(['#E8524A', '#F2C14E', '#F4F1EA', '#E8524A'][j], 0.5), segs=8, rings=6)
        T.win('sw0', (x1, -0.45, PL + 1.95), 'x+', w=0.5, h=0.62, shutters=navy, frame=white, seed=195)
        T.door('sdoor', (x1, sdoor_y, PL), 'x+', w=0.66, h=1.5, col='#3D7CC9', frame_col=white, step=False)
        # light bar on the ridge + star badge sign facing the camera
        rz = H + 1.2
        rbox_ = box('lbar', (0.62, 0.22, 0.1), (-0.6, (y0 + y1) / 2, rz + 0.05), mat=flat('#2B2F3A', 0.4), bevel=0.03)
        del rbox_
        sphere('lblue', 0.11, (-0.78, (y0 + y1) / 2, rz + 0.17), L.emissive('lb', '#5A9BFF', '#5A9BFF', 2.6),
               scale=(1, 1, 0.8), segs=14, rings=8)
        sphere('lred', 0.11, (-0.42, (y0 + y1) / 2, rz + 0.17), L.emissive('lr', '#FF5A5A', '#FF5A5A', 2.6),
               scale=(1, 1, 0.8), segs=14, rings=8)
        T.sign_disc('star', (-1.75, y0 + 0.62, H + 0.95), r=0.48, bg=navy, rim='#F2C14E', emblem=T.em_star, es=1.0,
                    tilt=6.0)
        for s in (-1, 1):
            cyl('sleg', 0.04, 0.5, (-1.75 + s * 0.26, y0 + 0.62 + s * 0.26, H + 0.25), mat=flat('#3D424C', 0.4, 0.6),
                segs=8)
        chim, smoke = T.chimney('chim', -2.6, 1.05, H, H + 1.3, col='#8E8682', w=0.34)
    # ------------------------------------------------------------------ dollhouse stubs
    with layer('shell_cut'):
        fr = CL.wall_x('stub_f', x0, x1, y0 + t / 2, PL, PL + P_STUB, t, clap,
                       holes=[(door_x - 0.55, door_x + 0.55, PL - 0.01, PL + P_STUB + 0.1)])
        rt = CL.wall_y('stub_r', y0 + t, y1, x1 - t / 2, PL, PL + P_STUB, t, clap,
                       holes=[(sdoor_y - 0.42, sdoor_y + 0.42, PL - 0.01, PL + P_STUB + 0.1)])
        cap_strip('stubcap', fr + rt)
    # ------------------------------------------------------------------ markers
    mark('door', (door_x, y0 - 0.85, 0.0), facing=(0, 1, 0))
    mark('entry', (door_x, yi0 + 0.3, PL), facing=(0, 1, 0))
    mark('staff', (door_x, 0.48, PL), facing=(0, -1, 0))
    mark('staff', (fcx - 0.05, yi1 - 0.82, PL), facing=(0, -1, 0))
    mark('customer', (door_x, -0.42, PL), facing=(0, 1, 0))
    mark('customer', (door_x + 0.45, -0.85, PL), facing=(-0.3, 1, 0))
    for y in (-0.95, -0.35):
        mark('seat', (bench_x + 0.2, y, PL + 0.45), facing=(1, 0, 0))
    # inmates stand on the cell rug facing the camera so the face reads between the bars (not behind the corner post)
    mark('cell', (-1.94, 1.0, PL), facing=(1, 0, 0))
    mark('cell', (-2.0, 0.55, PL), facing=(1, 0, 0))
    mark('cellseat', (bx_ + 0.33, by_ - 0.1, PL + 0.45), facing=(1, 0, 0))
    mark('celldoor', ((cdx0 + cdx1) / 2, cy0 - 0.45, PL), facing=(0, 1, 0))
    mark('carbay', (2.11, 0.0, 0.0), facing=(0, -1, 0))
    mark('sidedoor', (x1 + 0.55, sdoor_y, 0.0), facing=(-1, 0, 0))
    return {'fx': {'siren': (-0.6, (y0 + y1) / 2, rz + 0.2), 'smoke': smoke, 'sign': (-1.75, y0 + 0.62, H + 0.95),
                   'lamp': (door_x, y0 - 0.32, PL + 2.1), 'stove': (sx_, sy_, PL + 0.7)},
            'extra': {'floorLiftPx': int(round(PL * 55.4256)), 'stubM': P_STUB}}


# =========================================================================== more RUINS

def log_wall_x(name, x0, lens, y, z0, seed=0, r=0.12, warm_k=None):
    """Stacked charred logs along X starting at x0 (lengths decreasing = jagged ruined wall)."""
    for k, ln in enumerate(lens):
        log('%s%d' % (name, k), r, ln, (x0 + ln / 2 + 0.04 * (k % 2), y, z0 + r + k * 0.22), rot=(0, 90, 0),
            bark=CL.charcoal(5.0, snow=0.3, seed=seed + k, warm=2.5 if warm_k == k else 0.0),
            end=CL.charcoal(9.0, seed=seed + k + 9, base='#4A3A33'), segs=12)


def log_wall_y(name, y1, lens, x, z0, seed=0, r=0.12):
    """Stacked charred logs along Y ending at y1 (they get shorter toward -Y)."""
    for k, ln in enumerate(lens):
        log('%s%d' % (name, k), r, ln, (x, y1 - ln / 2 - 0.04 * (k % 2), z0 + r + 0.11 + k * 0.22), rot=(90, 0, 0),
            bark=CL.charcoal(5.0, snow=0.3, seed=seed + k + 20), end=CL.charcoal(9.0, seed=seed + k + 29,
                                                                               base='#4A3A33'), segs=12)


def door_frame(name, x, y, w=0.7, h=1.5, door=True, col='#3D7CC9', lean=-24.0, seed=0):
    """A charred door frame that is still standing, with its (singed, colourful) door hanging askew."""
    m = CL.charcoal(5.0, snow=0.3, seed=seed)
    objs = [box(name + '_l', (0.12, 0.14, h), (x - w / 2, y, 0.0), mat=m, bevel=0.025),
            box(name + '_r', (0.12, 0.14, h * 0.82), (x + w / 2, y, 0.0), mat=m, bevel=0.025),
            box(name + '_t', (w + 0.3, 0.16, 0.12), (x - 0.05, y, h), rot=(0, -6, 0), mat=m, bevel=0.025),
            PA.snow_cap(name + '_sn', 0.12, (x - 0.15, y, h + 0.12), h=0.05, seed=seed)]
    if door:
        dw = w - 0.06
        dm = CL.scorched(col, 0.6, 1.6, amount=0.9)
        d = box(name + '_door', (dw, 0.06, h - 0.1), (-dw / 2, 0, 0), mat=dm, bevel=0.02)
        knob = sphere(name + '_knob', 0.035, (-dw * 0.85, -0.05, (h - 0.1) * 0.45), flat('#F2C14E', 0.3, 0.7),
                      segs=8, rings=6)
        g = L.group([d, knob], name + '_dg', loc=(x + w / 2 - 0.06, y - 0.04, 0.02))
        g.rotation_euler = Euler((0, math.radians(-6), math.radians(lean)), 'XYZ')
        objs.append(g)
    return objs


def bathtub(name, loc, rot_z=0.0, s=1.0):
    """White clawfoot bathtub (survived the fire, a bit sooty) - comic detail."""
    wm = flat('#F4F1EA', 0.35)
    objs = [box(name, (1.1 * s, 0.58 * s, 0.42 * s), (0, 0, 0.14 * s), mat=wm, bevel=0.2 * s),
            box(name + '_in', (0.92 * s, 0.42 * s, 0.05 * s), (0, 0, 0.52 * s), mat=flat('#9CC7E6', 0.2), bevel=0.02),
            box(name + '_soot', (1.12 * s, 0.6 * s, 0.12 * s), (0, 0, 0.44 * s),
                mat=CL.scorched('#F4F1EA', 0.3, 0.9, amount=0.6), bevel=0.05),
            PA.snow_cap(name + '_sn', 0.25 * s, (0.1 * s, 0, 0.54 * s), h=0.06, seed=3, scale=(1.4, 0.9, 1.0))]
    for sx in (-1, 1):
        for sy in (-1, 1):
            objs.append(sphere(name + '_foot', 0.06 * s, (sx * 0.42 * s, sy * 0.2 * s, 0.07 * s), CL.gold(),
                               scale=(1, 1, 1.3), segs=10, rings=6))
    objs.append(cyl(name + '_tap', 0.025 * s, 0.22 * s, (0.5 * s, 0, 0.5 * s), mat=CL.gold(), segs=8))
    objs.append(sphere(name + '_duck', 0.06 * s, (-0.1 * s, 0.05 * s, 0.6 * s), flat('#F2C230', 0.4), segs=12,
                       rings=8))
    objs.append(sphere(name + '_duckh', 0.04 * s, (-0.15 * s, 0.05 * s, 0.68 * s), flat('#F2C230', 0.4), segs=10,
                       rings=6))
    objs.append(sphere(name + '_beak', 0.018 * s, (-0.19 * s, 0.05 * s, 0.67 * s), flat('#EE7F33', 0.4),
                       scale=(1.6, 1, 0.6), segs=8, rings=5))
    return L.group(objs, name + '_g', loc=loc, rot=(0, 0, rot_z))


def safe_box(name, loc, rot_z=0.0):
    im = flat('#3E4A5C', 0.4, 0.5)
    objs = [box(name, (0.5, 0.46, 0.55), (0, 0, 0), mat=im, bevel=0.05),
            cyl(name + '_dial', 0.07, 0.04, (0.05, -0.24, 0.32), rot=(90, 0, 0), mat=CL.gold(), segs=18,
                origin='center', bevel=0.01),
            box(name + '_h', (0.04, 0.04, 0.16), (-0.12, -0.25, 0.22), mat=CL.gold(), bevel=0.01),
            PA.snow_cap(name + '_sn', 0.16, (0, 0, 0.56), h=0.05, seed=5)]
    return L.group(objs, name + '_g', loc=loc, rot=(0, 0, rot_z))


def win_cutter(name, target, x, y, z0, z1, w, axis='x', depth=0.6):
    """Cut a window opening through a ruined wall (boolean, evaluated at render)."""
    import veh_lib as VL
    size = (w, depth, z1 - z0) if axis == 'x' else (depth, w, z1 - z0)
    c = box(name, size, (x, y, z0), mat=CL.charcoal(6.0, seed=3, base='#4A403B'), bevel=0.0)
    VL.add_bool(target, c, transfer=True)
    return c


def charred_sill(name, x, y, z, w, axis='x'):
    m = CL.charcoal(6.0, snow=0.3, seed=7)
    size = (w + 0.12, 0.2, 0.07) if axis == 'x' else (0.2, w + 0.12, 0.07)
    return box(name, size, (x, y, z - 0.07), mat=m, bevel=0.02)


@civ('ruin_s', 'ruin', 'civ_ruins', fp=(2.0, 2.0), catcher=18.0, samples=40,
     notes=RUIN_NOTE % ('S', 2, 2, 'S', 'house_a / b / c (2-2.5 m homes)', 'a burnt little log cottage - one charred '
                        'corner post, a low back log wall, the front door frame still standing with its blue door '
                        'hanging askew, the little iron stove and a blue mailbox survived, ash heap + embers',
                        'ruin_s'),
     ko='불탄 집 (소)', en='Burnt ruin S', zone='ruins')
def b_ruin_s():
    stone_course('found', -0.78, 0.78, -0.72, 0.8, seed=311)
    charred_floor('floor', 1.35, 1.32, 0.0, 0.04, seed=4)
    log_wall_x('blog', -0.8, [1.6, 1.25, 0.7], 0.72, 0.12, seed=1, warm_k=1)
    log_wall_y('llog', 0.78, [1.4, 0.9], -0.75, 0.12, seed=5)
    CL.charred_post('post0', -0.78, 0.74, 1.75, seed=1)
    CL.charred_post('post1', 0.78, 0.74, 1.05, seed=2, lean=(0, 8))
    door_frame('dframe', 0.2, -0.72, w=0.62, h=1.42, col='#3D7CC9', seed=3)
    iron_stove('stove', (-0.35, 0.3, 0.05), s=0.85)
    CL.charred_beam('beam0', (-0.65, -0.45, 0.08), (0.55, 0.45, 0.4), r=0.07, seed=60, warm=2.5)
    CL.charred_beam('beam1', (0.6, -0.5, 0.06), (-0.1, 0.65, 0.5), r=0.065, seed=61)
    CL.ash_mound('ash0', 0.3, (0.3, -0.15, 0.05), seed=17)
    CL.embers('emb0', (0.3, -0.15, 0.27), 0.14, 5, seed=18)
    CL.cinder_bits('cinders', (0.0, 0.0), 0.75, 18, seed=19, z=0.05)
    mailbox('mbox', (-1.0, -0.95, 0.0), col='#D9483B', lean=6)
    LA.snow_drift('d0', 0.22, (0.95, 1.0, 0.0), seed=21)
    bases = [(0.3, -0.15, 0.28), (-0.35, 0.3, 0.75)]
    sm, set_sm = CL.smoke_wisps('wisp', bases, seed=7, rise=1.3)
    CL.overlay('smoke', [o for s in sm for o in s.obs], lambda i: set_sm(i, 4), 4, fps=6, repeat=-1)
    for b in bases:
        CL.bounds_marker('wb', (b[0] + 0.5, b[1] + 0.2, b[2] + 1.6))
    mark('work', (-0.2, -1.4, 0.0), facing=(0, 1, 0))
    mark('work', (1.35, 0.15, 0.0), facing=(-1, 0, 0))
    return {'fx': {'smoke': bases[0], 'smoke2': bases[1], 'ember': (0.3, -0.15, 0.3)}}


@civ('ruin_l', 'ruin', 'civ_ruins', fp=(4.0, 4.0), catcher=26.0, samples=40,
     notes=RUIN_NOTE % ('L', 4, 4, 'L', 'big shops / hall', 'a burnt brick building - the back and left brick walls '
                        'stand with empty window holes and jagged sooty tops, a tall chimney, collapsed charred roof '
                        'trusses, a big ash heap, the iron safe and a white clawfoot bathtub (with a rubber duck!) '
                        'survived', 'ruin_l'),
     ko='불탄 건물 (대)', en='Burnt ruin L', zone='ruins')
def b_ruin_l():
    brickm = CL.scorched('#B4593F', 0.6, 2.2, amount=1.0, snow=0.25)
    rnd = L.rng(401)
    stone_course('found', -1.6, 1.6, -1.5, 1.6, seed=402)
    charred_floor('floor', 2.95, 2.85, 0.0, 0.05, seed=5)
    # back wall (+Y) and left wall (-X): jagged brick walls with window holes
    bw = CL.jagged_wall_x('bwall', -1.62, 1.62, 1.48, 0.24, [(-1.62, 2.5), (-1.1, 2.6), (-0.7, 2.2), (-0.35, 2.35),
                                                           (0.1, 1.7), (0.5, 1.9), (0.9, 1.25), (1.3, 1.45),
                                                           (1.62, 0.9)], brickm, z0=0.1, seed=3)
    win_cutter('bwc0', bw[0], -0.95, 1.48, 1.0, 1.85, 0.6, axis='x')
    win_cutter('bwc1', bw[0], 0.35, 1.48, 0.9, 1.6, 0.55, axis='x')
    charred_sill('bws0', -0.95, 1.36, 1.0, 0.6)
    charred_sill('bws1', 0.35, 1.36, 0.9, 0.55)
    lw = CL.jagged_wall_y('lwall', -1.5, 1.6, -1.5, 0.24, [(-1.5, 0.8), (-1.0, 1.25), (-0.5, 1.1), (-0.1, 1.85),
                                                         (0.4, 2.05), (0.9, 2.4), (1.6, 2.5)], brickm, z0=0.1,
                          seed=5)
    win_cutter('lwc0', lw[0], -1.5, 0.55, 0.95, 1.75, 0.55, axis='y')
    charred_sill('lws0', -1.38, 0.55, 0.95, 0.55, axis='y')
    # low front / right stubs
    CL.jagged_wall_x('fwall', -1.62, 1.62, -1.38, 0.22, [(-1.62, 0.75), (-1.1, 0.55), (-0.6, 0.35), (0.2, 0.3),
                                                        (0.8, 0.5), (1.62, 0.4)], brickm, z0=0.1, seed=7)
    CL.jagged_wall_y('rwall', -1.38, 1.6, 1.5, 0.22, [(-1.38, 0.45), (-0.6, 0.3), (0.3, 0.6), (1.0, 0.85),
                                                     (1.6, 0.95)], brickm, z0=0.1, seed=9)
    objs, top = chimney_stack('chim', 1.05, 1.15, 3.2, w=0.5, col='#9A6A5A', seed=8)
    # collapsed trusses + beams
    CL.charred_beam('tr0', (-1.3, 1.2, 2.2), (0.6, -0.6, 0.15), r=0.08, seed=70)
    CL.charred_beam('tr1', (-1.3, -0.4, 1.0), (1.2, 0.8, 0.12), r=0.08, seed=71, warm=2.5)
    CL.charred_beam('tr2', (-0.2, 1.3, 1.7), (-0.9, -1.0, 0.1), r=0.075, seed=72)
    CL.charred_beam('tr3', (0.9, -1.1, 0.12), (1.3, 0.6, 0.75), r=0.07, seed=73)
    rp = box('roofp', (1.5, 1.2, 0.08), (0, 0, 0), mat=CL.charcoal(4.0, snow=0.2, seed=74), bevel=0.03,
             origin='center')
    rp.location = (0.35, 0.55, 0.55)
    rp.rotation_euler = Euler((math.radians(-24), math.radians(-10), math.radians(25)), 'XYZ')
    for k in range(9):
        if rnd.random() < 0.2:
            continue
        sh = box('shingle', (0.32, 0.22, 0.03), (0, 0, 0), mat=flat(['#3D6FA8', '#335E91'][k % 2], 0.7), bevel=0.012,
                 origin='center')
        sh.parent = rp
        sh.location = (-0.5 + 0.36 * (k % 3) + 0.08 * ((k // 3) % 2), -0.4 + 0.3 * (k // 3), 0.055)
    CL.ash_mound('ash0', 0.55, (-0.2, -0.2, 0.06), seed=31, h=0.38)
    CL.ash_mound('ash1', 0.32, (0.9, -0.75, 0.06), seed=32)
    CL.embers('emb0', (-0.2, -0.2, 0.36), 0.25, 8, seed=33)
    CL.cinder_bits('cinders', (0.0, 0.0), 1.5, 40, seed=34, z=0.06)
    CL.bricks('bricks0', (0.5, -1.05), 0.45, 9, seed=35, col='#B4593F', z=0.02)
    CL.bricks('bricks1', (-1.0, -0.6), 0.35, 6, seed=36, col='#B4593F', z=0.02)
    CL.plank_scatter('planks', (-0.6, 0.6), 0.5, 4, seed=37, cols=(CL.CHAR, '#8A5A33', CL.CHAR_LIGHT))
    bathtub('tub', (-0.75, 0.75, 0.06), rot_z=20)
    safe_box('safe', (0.75, 0.15, 0.06), rot_z=-25)
    LA.snow_drift('d0', 0.32, (-1.95, -1.7, 0.0), seed=38)
    LA.snow_drift('d1', 0.26, (1.95, 1.9, 0.0), seed=39)
    bases = [(-0.2, -0.2, 0.4), (0.5, 0.35, 0.6), (1.05, 1.15, 3.3)]
    sm, set_sm = CL.smoke_wisps('wisp', bases, seed=11, rise=1.6)
    CL.overlay('smoke', [o for s in sm for o in s.obs], lambda i: set_sm(i, 4), 4, fps=6, repeat=-1)
    for b in bases:
        CL.bounds_marker('wb', (b[0] + 0.55, b[1] + 0.2, b[2] + 1.8))
    mark('work', (-0.4, -2.4, 0.0), facing=(0, 1, 0))
    mark('work', (2.4, 0.3, 0.0), facing=(-1, 0, 0))
    mark('work', (0.9, -2.35, 0.0), facing=(0, 1, 0))
    return {'fx': {'smoke': bases[0], 'smoke2': bases[1], 'chimney': top, 'ember': (-0.2, -0.2, 0.4)}}


@civ('ruin_house_town', 'ruin', 'civ_ruins', fp=(2.6, 2.6), catcher=22.0, samples=40,
     notes=('Burnt townhouse (2.6 x 2.6 m, same anchor / footprint as townhouse_a..d in assets/town, so it replaces '
            'one in place): butter-yellow plaster walls blackened toward their jagged tops, the front door frame and '
            'window holes with soot plumes, half of the gable standing, a collapsed red roof leaning in, the brick '
            'chimney still up, and the flower box under the window - flowers and all - survived. '
            'ruin_house_town_smoke = smoke overlay (anims.smoke). Draw scorch_decal_m under it.'),
     ko='불탄 주택', en='Burnt townhouse', zone='ruins')
def b_ruin_house_town():
    W, D, X, Y, PL = 2.2, 2.1, -0.05, 0.15, 0.18
    x0, x1, y0, y1 = X - W / 2, X + W / 2, Y - D / 2, Y + D / 2
    wall = CL.scorched('#F6DD8A', 0.9, 2.6, amount=1.0, snow=0.2)
    T.plinth('plinth', W, D, h=PL, col='#6E6866', x=X, y=Y)
    charred_floor('floor', W - 0.2, D - 0.2, X, Y, seed=6)
    # front wall (-Y) with the door hole and a window hole
    fw = CL.jagged_wall_x('fwall', x0, x1, y0 + 0.08, 0.16, [(x0, 2.2), (x0 + 0.5, 2.45), (x0 + 0.9, 1.9),
                                                           (x0 + 1.3, 1.65), (x0 + 1.7, 1.35), (x1, 1.0)], wall,
                          z0=PL, seed=11)
    win_cutter('fdoor', fw[0], x1 - 0.55, y0 + 0.08, PL - 0.02, PL + 1.3, 0.66, axis='x')
    win_cutter('fwin', fw[0], x0 + 0.6, y0 + 0.08, PL + 0.55, PL + 1.15, 0.55, axis='x')
    CL.soot_streak('ss0', (x0 + 0.6, y0 - 0.005, PL + 1.15), 'y-', w=0.6, h=0.75)
    CL.soot_streak('ss1', (x1 - 0.55, y0 - 0.005, PL + 1.3), 'y-', w=0.6, h=0.6)
    charred_sill('fsill', x0 + 0.6, y0 - 0.02, PL + 0.55, 0.55)
    # the survivor: flower box under the window
    box('fbox', (0.66, 0.18, 0.14), (x0 + 0.6, y0 - 0.1, PL + 0.36), mat=flat('#A86A36', 0.8), bevel=0.03)
    for k in range(5):
        sphere('fbl', 0.055, (x0 + 0.4 + 0.1 * k, y0 - 0.1, PL + 0.54), flat(['#E8524A', '#F2C14E'][k % 2], 0.5),
               segs=8, rings=6)
    door_frame('dframe', x1 - 0.55, y0 + 0.02, w=0.64, h=1.32, col='#3E8E57', door=True, lean=-30, seed=12)
    # right wall (+X), low and broken
    rw = CL.jagged_wall_y('rwall', y0 + 0.08, y1, x1 - 0.08, 0.16, [(y0 + 0.08, 0.9), (y0 + 0.6, 1.15),
                                                                   (Y + 0.1, 0.7), (y1 - 0.4, 1.0), (y1, 1.3)], wall,
                          z0=PL, seed=13)
    win_cutter('rwin', rw[0], x1 - 0.08, Y - 0.2, PL + 0.4, PL + 0.95, 0.5, axis='y')
    # back wall (+Y) high with half of the gable, left wall (-X)
    bw = CL.jagged_wall_x('bwall', x0, x1, y1 - 0.08, 0.16, [(x0, 2.9), (x0 + 0.4, 3.15), (X, 3.5), (X + 0.35, 3.0),
                                                           (x1 - 0.5, 2.4), (x1, 1.8)], wall, z0=PL, seed=15)
    win_cutter('bwin', bw[0], X + 0.35, y1 - 0.08, PL + 1.75, PL + 2.3, 0.45, axis='x')
    CL.jagged_wall_y('lwall', y0, y1 - 0.08, x0 + 0.08, 0.16, [(y0, 2.1), (y0 + 0.5, 1.6), (Y, 2.4), (y1 - 0.6, 2.7),
                                                              (y1 - 0.08, 3.0)], wall, z0=PL, seed=17)
    # collapsed red roof leaning in from the back
    for k, (loc, rot, size) in enumerate((((X - 0.25, Y + 0.25, 1.05), (-38, 8, 6), (1.5, 1.2)),
                                          ((X + 0.55, Y - 0.25, 0.42), (16, -20, -25), (0.9, 0.8)))):
        rp = box('roofp%d' % k, (size[0], size[1], 0.08), (0, 0, 0), mat=CL.charcoal(4.0, snow=0.2, seed=80 + k),
                 bevel=0.03, origin='center')
        rp.location = loc
        rp.rotation_euler = Euler([math.radians(v) for v in rot], 'XYZ')
        n = 8 if k == 0 else 4
        for j in range(n):
            sh = box('shingle', (0.3, 0.22, 0.03), (0, 0, 0), mat=flat(['#C8473A', '#A83A30'][j % 2], 0.7),
                     bevel=0.012, origin='center')
            sh.parent = rp
            sh.location = (-size[0] / 2 + 0.25 + 0.34 * (j % 4), -size[1] / 2 + 0.25 + 0.3 * (j // 4), 0.055)
    chimney_stack('chim', x0 + 0.45, Y + D * 0.25, 3.85, w=0.36, col='#B4593F', seed=9)
    CL.charred_beam('beam0', (x0 + 0.2, y0 + 0.3, 0.25), (x1 - 0.3, y1 - 0.3, 1.2), r=0.07, seed=90, warm=2.5)
    CL.ash_mound('ash0', 0.32, (X + 0.2, Y - 0.3, PL), seed=91)
    CL.embers('emb0', (X + 0.2, Y - 0.3, PL + 0.22), 0.14, 5, seed=92)
    CL.cinder_bits('cinders', (X, Y), 0.9, 20, seed=93, z=PL)
    LA.snow_drift('d0', 0.24, (x1 + 0.3, y1 + 0.1, 0.0), seed=94)
    T.flower_tub('tub', (x0 - 0.12, y0 - 0.3, 0.0), r=0.17, evergreen=True, seed=95)
    bases = [(X + 0.2, Y - 0.3, PL + 0.25), (x0 + 0.45, Y + D * 0.25, 4.0)]
    sm, set_sm = CL.smoke_wisps('wisp', bases, seed=13, rise=1.4)
    CL.overlay('smoke', [o for s in sm for o in s.obs], lambda i: set_sm(i, 4), 4, fps=6, repeat=-1)
    for b in bases:
        CL.bounds_marker('wb', (b[0] + 0.55, b[1] + 0.2, b[2] + 1.7))
    mark('door', (x1 - 0.55, y0 - 0.85, 0.0), facing=(0, 1, 0))
    mark('work', (X - 0.3, y0 - 0.9, 0.0), facing=(0, 1, 0))
    mark('work', (x1 + 0.7, Y, 0.0), facing=(-1, 0, 0))
    return {'fx': {'smoke': bases[0], 'chimney': bases[1], 'ember': (X + 0.2, Y - 0.3, PL + 0.25)}}


# =========================================================================== RUBBLE (after demolition)

RUBBLE_NOTE = ('Rubble pile for a %s plot (%g x %g m, same anchor / footprint as ruin_%s and site_*_%s): what is left '
               'after the excavator knocked the ruin down - a heap of charred beams and planks, bricks, ash and '
               'cinders with a few bright bits (red shingles, a blue shutter) and fresh snow on top. rubble_pile_%s_half '
               '= the same heap half carted away (same frame + anchor: swap in place while the dump truck works). '
               'workPoints = where workers shovel / the bucket bites.')


def _rubble_builder(sz, a):
    def fn():
        rnd = L.rng(500 + int(a * 10))
        h = a / 2
        with L.Collect() as base:
            CL.cinder_bits('cind', (0, 0), h * 0.95, int(14 * a), seed=501, z=0.0)
            for k in range(int(a * 2)):
                LA.snow_drift('sd', rnd.uniform(0.15, 0.25), (rnd.uniform(-h, h), rnd.uniform(-h, h), 0.0),
                              seed=510 + k)
        with L.Collect() as full:
            CL.ash_mound('mound', h * 0.62, (0.0, 0.05, 0.0), seed=520, h=0.42, snow=0.12)
            CL.ash_mound('mound2', h * 0.38, (h * 0.5, -h * 0.35, 0.0), seed=521, h=0.4, snow=0.14)
            blob('charheap', h * 0.4, (-h * 0.25, h * 0.2, 0.0), CL.charcoal(4.0, snow=0.25, seed=522),
                 scale=(1.2, 1.0, 0.5), seed=523, amp=0.3, subdiv=3, flat_bottom=0.3)
            for k in range(int(4 + a * 2)):
                p = (rnd.uniform(-h * 0.75, h * 0.75), rnd.uniform(-h * 0.75, h * 0.75), rnd.uniform(0.15, 0.32))
                ang = rnd.uniform(0, math.tau)
                ln = rnd.uniform(0.5, 0.45 + a * 0.25)
                q = (p[0] + ln * math.cos(ang), p[1] + ln * math.sin(ang), p[2] + rnd.uniform(-0.05, 0.28))
                CL.charred_beam('rb', p, q, r=rnd.uniform(0.055, 0.085), seed=530 + k, warm=0.0)
            CL.bricks('rbricks', (0.0, 0.0), h * 0.8, int(10 * a), seed=540, col='#B4593F', z=0.2)
            CL.bricks('rbricks2', (h * 0.3, -h * 0.4), h * 0.4, int(4 * a), seed=542, col='#9A6A5A', z=0.05)
            CL.cinder_bits('rchunks', (0.0, 0.0), h * 0.7, int(10 * a), seed=543, size=0.09, z=0.25)
            CL.plank_scatter('rplanks', (0.0, 0.0), h * 0.6, int(1 + a * 0.5), seed=541,
                             cols=(CL.CHAR, '#C98F55', '#3D6FA8'), z=0.3, length=(0.4, 0.7))
            for k in range(int(a * 1.5)):
                box('tile', (0.26, 0.18, 0.03), (rnd.uniform(-h * 0.6, h * 0.6), rnd.uniform(-h * 0.6, h * 0.6),
                                                rnd.uniform(0.28, 0.42)), rot=(rnd.uniform(-25, 25), rnd.uniform(-25, 25),
                                                                               rnd.uniform(0, 180)),
                    mat=flat(['#C8473A', '#A83A30'][k % 2], 0.7), bevel=0.01)
        with L.Collect() as half:
            CL.ash_mound('hmound', h * 0.45, (h * 0.15, 0.25, 0.0), seed=550, h=0.32, snow=0.14)
            blob('hcharheap', h * 0.25, (-h * 0.1, h * 0.35, 0.0), CL.charcoal(4.0, snow=0.25, seed=551),
                 scale=(1.2, 1.0, 0.5), seed=552, amp=0.3, subdiv=3, flat_bottom=0.3)
            for k in range(int(2 + a * 0.6)):
                p = (rnd.uniform(-h * 0.4, h * 0.6), rnd.uniform(-h * 0.2, h * 0.7), 0.06)
                ang = rnd.uniform(0, math.tau)
                ln = rnd.uniform(0.5, 0.4 + a * 0.2)
                q = (p[0] + ln * math.cos(ang), p[1] + ln * math.sin(ang), p[2] + rnd.uniform(0.1, 0.35))
                CL.charred_beam('hb', p, q, r=0.06, seed=560 + k)
            CL.bricks('hbricks', (h * 0.2, 0.3), h * 0.45, int(5 * a), seed=570, col='#B4593F', z=0.12)
        every = BA.descendants(base.objs + full.objs + half.objs)

        def setter(groups):
            def f_():
                BA.show(every, False)
                BA.show(BA.descendants(sum(groups, [])), True)
            return f_
        mark('work', (-a * 0.15, -h - 0.55, 0.0), facing=(0, 1, 0))
        mark('work', (h + 0.55, a * 0.1, 0.0), facing=(-1, 0, 0))
        names = ['rubble_pile_%s' % sz.lower(), 'rubble_pile_%s_half' % sz.lower()]
        return {'frames': [(names[0], setter([base.objs, full.objs])), (names[1], setter([base.objs, half.objs]))],
                'sprites': {names[0]: {'frame': names[0], 'stage': 0}, names[1]: {'frame': names[1], 'stage': 1}}}
    return fn


for _sz, _a in (('S', 2.0), ('M', 3.0), ('L', 4.0)):
    civ('rubble_pile_%s' % _sz.lower(), 'rubble', 'civ_ruins', fp=(_a, _a), catcher=10.0 + 4 * _a, samples=40,
        sprites=['rubble_pile_%s' % _sz.lower(), 'rubble_pile_%s_half' % _sz.lower()],
        notes=RUBBLE_NOTE % (_sz, _a, _a, _sz.lower(), _sz, _sz.lower()), ko='잔해 더미 (%s)' % _sz,
        en='Rubble pile %s' % _sz, zone='demolition')(_rubble_builder(_sz, _a))


# =========================================================================== POLICE / FIRE PROPS

WANTED_NOTE = ('Wanted board (2.3 m wide, faces the camera): a little roofed wooden notice board with a gold police '
               'star on top and three blank cream WANTED posters (red header band, empty portrait window, gold reward '
               'strip, red pins). posterPoints = centre of each portrait window, posterSizePx = its size at 1x - '
               'the game draws a resident portrait (and name / reward text) there; gatherPoints = where villagers '
               'stand to read it (facing the board).')


@civ('wanted_board', 'decor', 'civ_props', fp=(2.3, 0.5), yaw=45.0, front='S', catcher=12.0, samples=40,
     notes=WANTED_NOTE, ko='현상수배 게시판', en='Wanted board', zone='police')
def b_wanted_board():
    wood = flat('#8A5A33', 0.7)
    W, Hb, zb = 2.1, 1.12, 0.62
    for s in (-1, 1):
        box('post', (0.12, 0.12, zb + Hb + 0.3), (s * (W / 2 + 0.02), 0.0, 0.0), mat=wood, bevel=0.025)
        PA.snow_cap('psn', 0.07, (s * (W / 2 + 0.02), 0.0, zb + Hb + 0.62), h=0.04, seed=s + 3)
    box('panel', (W, 0.08, Hb), (0, 0.02, zb), mat=flat('#C9A06B', 0.9), bevel=0.02)
    box('frame_t', (W + 0.1, 0.12, 0.1), (0, 0.0, zb + Hb), mat=wood, bevel=0.02)
    box('frame_b', (W + 0.1, 0.12, 0.1), (0, 0.0, zb - 0.08), mat=wood, bevel=0.02)
    LA.roof('roofF', W + 0.5, -0.38, zb + Hb + 0.12, 0.0, zb + Hb + 0.42, 0.05,
            L.stripes('#2E4F8A', '#27467C', 6.0, 'Y'), snow_frac=0.85, seed=3)
    LA.roof('roofB', W + 0.5, 0.38, zb + Hb + 0.12, 0.0, zb + Hb + 0.42, 0.05,
            L.stripes('#2E4F8A', '#27467C', 6.0, 'Y'), snow_frac=0.85, seed=4)
    T.sign_disc('star', (0, -0.1, zb + Hb + 0.62), r=0.22, bg='#2E4F8A', rim='#F2C14E', emblem=T.em_star, es=0.55,
                psi=0.0, tilt=0.0, snow=False)
    pw, ph = 0.56, 0.86
    for k, x in enumerate((-0.68, 0.0, 0.68)):
        z0 = zb + 0.13
        box('poster', (pw, 0.02, ph), (x, -0.03, z0), rot=(0, (k - 1) * 1.5, 0), mat=flat('#FBF3DF', 0.85),
            bevel=0.0)
        box('phead', (pw - 0.06, 0.025, 0.13), (x, -0.045, z0 + ph - 0.18), mat=flat('#C0392B', 0.7), bevel=0.0)
        box('pwin_f', (0.44, 0.024, 0.4), (x, -0.045, z0 + 0.3), mat=flat('#7A4E2E', 0.7), bevel=0.0)
        box('pwin', (0.38, 0.03, 0.34), (x, -0.05, z0 + 0.33), mat=flat('#F2E3C4', 0.9), bevel=0.0)
        box('preward', (pw - 0.12, 0.025, 0.08), (x, -0.045, z0 + 0.1), mat=flat('#F2C14E', 0.5), bevel=0.0)
        for sx in (-1, 1):
            sphere('pin', 0.025, (x + sx * (pw / 2 - 0.05), -0.07, z0 + ph - 0.04), flat('#D9483B', 0.4), segs=8,
                   rings=5)
        mark('poster', (x, -0.06, z0 + 0.5), facing=(0, -1, 0))
    LA.snow_drift('d0', 0.2, (W / 2 + 0.25, 0.2, 0.0), seed=7)
    for x in (-0.7, 0.0, 0.7):
        mark('gather', (x, -1.0, 0.0), facing=(0, 1, 0))
    return {'extra': {'posterSizePx': [int(round(0.38 * 64)), int(round(0.34 * 0.866 * 64))],
                      'posterNote': 'portrait window 0.38 x 0.34 m facing the camera (no skew); draw the portrait '
                                    'centred on posterPoints[i], scaled to posterSizePx'}}


HYDRANT_NOTE = ('Fire hydrant (0.75 m): chunky red toy hydrant with gold caps on little chains, a gold top nut and a '
                'snow cap. hosePoint = the side outlet facing screen down-right where the firefighters connect the '
                'hose (fx_hose_stream starts at the nozzle, not here).')


@civ('fire_hydrant', 'decor', 'civ_props', fp=('r', 0.22), catcher=8.0, samples=48, notes=HYDRANT_NOTE,
     ko='소화전', en='Fire hydrant', zone='fire')
def b_fire_hydrant():
    red = flat('#D9483B', 0.35)
    gold = flat('#F2C14E', 0.3, 0.6)
    cyl('base', 0.2, 0.08, (0, 0, 0), mat=red, segs=24, bevel=0.02)
    cyl('body', 0.14, 0.5, (0, 0, 0.08), mat=red, segs=24, r_top=0.13, bevel=0.02)
    cyl('band', 0.16, 0.06, (0, 0, 0.42), mat=red, segs=24, bevel=0.02)
    sphere('dome', 0.14, (0, 0, 0.55), red, scale=(1, 1, 0.8), segs=24, rings=12)
    cyl('nut', 0.05, 0.08, (0, 0, 0.64), mat=gold, segs=6, bevel=0.01)
    for k, (ax, ay) in enumerate(((1, 0), (0, -1), (-1, 0))):
        rz = math.degrees(math.atan2(ay, ax))
        g = L.group([cyl('out%d' % k, 0.06, 0.12, (0.06, 0, 0), rot=(0, 90, 0), mat=red, segs=16, origin='center',
                         bevel=0.01),
                     cyl('cap%d' % k, 0.065, 0.05, (0.14, 0, 0), rot=(0, 90, 0), mat=gold, segs=16, origin='center',
                         bevel=0.01)], 'outlet%d' % k, loc=(0, 0, 0.32), rot=(0, 0, rz))
        del g
    mb = L.MB()
    for k in range(5):
        mb.sphere(0.012, gold, loc=(0.15, -0.04 - 0.02 * k, 0.28 - 0.03 * k), segs=6, rings=4)
    mb.done('chain')
    PA.snow_cap('snow', 0.1, (0.0, 0.0, 0.66), h=0.06, seed=2)
    LA.snow_drift('d0', 0.14, (0.12, 0.16, 0.0), seed=4)
    mark('hose', (0.21, 0.0, 0.32), facing=(1, 0, 0))
    return {}


ALARM_NOTE = ('Fire alarm post (1.7 m): red post with a glass-fronted alarm box (white push button), a little hammer '
              'on a chain, a gold bell on top and a red lamp. idle = quiet; anims.work / anims.ring = 4-frame alarm '
              'loop (lamp flashes, bell hammer shakes) - play it when a resident reports a fire (sfx_fire_alarm_bell).')


@civ('fire_alarm_post', 'decor', 'civ_props', fp=('r', 0.2), catcher=8.0, samples=48, work=4, fps=10,
     notes=ALARM_NOTE, ko='화재 경보기', en='Fire alarm post', zone='fire', anim_name='ring')
def b_fire_alarm_post():
    red = flat('#D9483B', 0.35)
    cyl('foot', 0.14, 0.1, (0, 0, 0), mat=flat('#8E96A3', 0.6), segs=18, bevel=0.02)
    cyl('post', 0.05, 1.2, (0, 0, 0.1), mat=red, segs=14, bevel=0.01)
    box('box', (0.38, 0.24, 0.44), (0, -0.04, 0.9), mat=red, bevel=0.05)
    box('glass', (0.26, 0.02, 0.26), (0, -0.165, 0.99), mat=flat('#F4F1EA', 0.2), bevel=0.01)
    cyl('button', 0.07, 0.035, (0, -0.18, 1.12), rot=(90, 0, 0), mat=flat('#F4F1EA', 0.4), segs=16, origin='center',
        bevel=0.01)
    box('hammer', (0.03, 0.03, 0.12), (0.2, -0.1, 0.9), mat=flat('#8A5A33', 0.6), bevel=0.005)
    box('hammerh', (0.08, 0.04, 0.035), (0.2, -0.1, 1.02), mat=flat('#3D424C', 0.5, 0.5), bevel=0.005)
    box('roofb', (0.44, 0.3, 0.05), (0, -0.04, 1.33), mat=red, bevel=0.02)
    with L.Collect() as bc_:
        T.bell_model('bell', s=0.7, col='#E2B33C')
    bell = L.group(BA.top_level(bc_.objs), 'bellg', loc=(0, -0.04, 1.58))
    lamp_m = L.emissive('alarmlamp', '#A83A30', '#FF3A2A', 0.0)
    sphere('lamp', 0.1, (0.12, -0.06, 1.38), lamp_m, scale=(1, 1, 0.85), segs=16, rings=8)
    cyl('lampb', 0.08, 0.04, (0.12, -0.06, 1.33), mat=flat('#2B2F3A', 0.5), segs=14, bevel=0.01)
    hm = sphere('clapper', 0.03, (0.12, -0.04, 1.5), flat('#3D424C', 0.4, 0.6), segs=8, rings=6)
    PA.snow_cap('sn', 0.1, (-0.08, -0.04, 1.37), h=0.04, seed=3, scale=(1.2, 0.9, 1))

    def idle():
        L.set_emission(lamp_m, 0.0)
        bell.rotation_euler = Euler((0, 0, 0), 'XYZ')
        hm.location = (0.12, -0.04, 1.5)

    def work(i):
        L.set_emission(lamp_m, [3.5, 0.6, 3.5, 0.6][i])
        bell.rotation_euler = Euler((math.radians([8, -8, 6, -6][i]), 0, 0), 'XYZ')
        hm.location = (0.12 if i % 2 == 0 else 0.07, -0.04, 1.5)
    idle()
    return {'idle': idle, 'work': work, 'fx': {'bell': (0, -0.04, 1.6), 'lamp': (0.12, -0.06, 1.4)}}


# =========================================================================== SIGNS + MOVING

def umbrella_emblem(s=1.0):
    """Red umbrella sheltering a little house (insurance)."""
    red = flat('#D9483B', 0.45)
    objs = []
    pts = [(0.4 * s * math.cos(a), 0.4 * s * math.sin(a) * 0.62 + 0.05 * s) for a in
           [math.pi * k / 16 for k in range(17)]]
    for k in range(4):                                   # scalloped hem, left -> right
        cx_ = -0.3 * s + 0.2 * s * k
        for j in range(7):
            th = math.pi - math.pi * j / 6
            pt = (cx_ + 0.1 * s * math.cos(th), 0.05 * s + 0.045 * s * math.sin(th))
            if (k == 0 and j == 0) or (k == 3 and j == 6) or (j == 0 and k > 0):
                continue
            pts.append(pt)
    objs.append(T.ext_xz('umb', pts, 0.06 * s, red, bevel=0.012 * s))
    objs.append(cyl('umbh', 0.02 * s, 0.38 * s, (0, -0.03 * s, -0.33 * s), mat=flat('#3D424C', 0.4), segs=8))
    objs.append(T.ext_xz('house', [(-0.15 * s, -0.36 * s), (0.15 * s, -0.36 * s), (0.15 * s, -0.16 * s),
                                    (0.0, -0.04 * s), (-0.15 * s, -0.16 * s)], 0.06 * s, flat('#F2C14E', 0.5),
                         y=-0.05 * s, bevel=0.01 * s))
    objs.append(T.ext_xz('hdoor', [(-0.04 * s, -0.36 * s), (0.04 * s, -0.36 * s), (0.04 * s, -0.24 * s),
                                    (-0.04 * s, -0.24 * s)], 0.03 * s, flat('#7A4E2E', 0.6), y=-0.09 * s,
                         bevel=0.0))
    return objs


def em_house(s=1.0, col='#3E8E57'):
    objs = [T.ext_xz('house', [(-0.24 * s, -0.22 * s), (0.24 * s, -0.22 * s), (0.24 * s, 0.06 * s), (0.0, 0.26 * s),
                               (-0.24 * s, 0.06 * s)], 0.06 * s, flat(col, 0.5), bevel=0.015 * s),
            T.ext_xz('hdoor', [(-0.06 * s, -0.22 * s), (0.06 * s, -0.22 * s), (0.06 * s, -0.04 * s),
                               (-0.06 * s, -0.04 * s)], 0.03 * s, flat('#F4F1EA', 0.6), y=-0.05 * s, bevel=0.0),
            T.ext_xz('hheart', [(x * 0.06 * s, z * 0.06 * s + 0.08 * s) for x, z in T.heart_pts(1.0, 24)], 0.03 * s,
                     flat('#E8749A', 0.5), y=-0.05 * s, bevel=0.0)]
    return objs


def sign_board(name, center, w, h, border='#2E4F8A', face='#FBF6EA', t=0.06):
    objs = [box(name + '_b', (w + 0.08, t, h + 0.08), (0, 0, -h / 2 - 0.04), mat=flat(border, 0.6), bevel=0.02),
            box(name + '_f', (w - 0.04, t + 0.012, h - 0.04), (0, 0, -h / 2 + 0.02 - 0.04 + 0.04),
                mat=flat(face, 0.8), bevel=0.01)]
    return L.group(objs, name, loc=center)


INSURE_NOTE = ('Insurance sign (blank board on two posts, faces the camera) with a red umbrella sheltering a little '
               'house on top - put it on a burnt plot while insurance + the rebuild loan are arranged. '
               'fxPoints.board = board centre, boardPx = writable board size (the game renders the text).')


@civ('insurance_sign', 'decor', 'civ_props', fp=(1.2, 0.3), yaw=45.0, front='S', catcher=10.0, samples=40,
     notes=INSURE_NOTE, ko='보험 표지판', en='Insurance sign', zone='fire')
def b_insurance_sign():
    wood = flat('#C98F55', 0.7)
    for s in (-1, 1):
        box('post', (0.08, 0.08, 1.35), (s * 0.48, 0.0, 0.0), mat=wood, bevel=0.02)
        PA.snow_cap('psn', 0.05, (s * 0.48, 0.0, 1.36), h=0.03, seed=s + 5)
    sign_board('board', (0, -0.06, 1.25), 1.0, 0.58, border='#3D7CC9')
    with L.Collect() as ec:
        umbrella_emblem(0.8)
    L.group(BA.top_level(ec.objs), 'umbrella', loc=(0, -0.08, 1.56))
    LA.snow_drift('d0', 0.16, (0.55, 0.15, 0.0), seed=7)
    return {'fx': {'board': (0, -0.1, 0.96)}, 'extra': {'boardPx': [int(0.92 * 64), int(0.5 * 0.866 * 64)]}}


def yard_sign(sold=False):
    wood = flat('#F4F1EA', 0.6)
    box('post', (0.08, 0.08, 1.45), (-0.42, 0.0, 0.0), mat=wood, bevel=0.02)
    box('arm', (0.9, 0.07, 0.07), (0.0, 0.0, 1.32), mat=wood, bevel=0.02)
    box('brace', (0.32, 0.05, 0.05), (-0.3, 0.0, 1.18), rot=(0, -40, 0), mat=wood, bevel=0.01)
    mb = L.MB()
    for x in (-0.18, 0.32):
        mb.seg(Vector((x, 0.0, 1.32)), Vector((x, -0.02, 1.2)), 0.008, flat('#3D424C', 0.4, 0.6), segs=5)
    mb.done('chains')
    sign_board('board', (0.07, -0.02, 1.2), 0.62, 0.42, border='#3E8E57')
    with L.Collect() as ec:
        em_house(0.55)
    L.group(BA.top_level(ec.objs), 'house', loc=(-0.42, -0.06, 1.62))
    PA.snow_cap('psn', 0.06, (-0.42, 0.0, 1.46), h=0.03, seed=5)
    L.snow_slab('asn', 0.7, 0.07, 0.03, (0.05, 0.0, 1.355), seed=6)
    if sold:
        rib = box('ribbon', (0.82, 0.03, 0.12), (0.07, -0.07, 0.98), rot=(0, -24, 0), mat=flat('#D9483B', 0.5),
                  bevel=0.01, origin='center')
        del rib
        ht = T.ext_xz('heart', [(x * 0.07, z * 0.07) for x, z in T.heart_pts(1.0, 24)], 0.03, flat('#E8749A', 0.45),
                      y=-0.08, bevel=0.008)
        ht.location.x = 0.3
        ht.location.z = 1.06
    LA.snow_drift('d0', 0.14, (-0.2, 0.18, 0.0), seed=8)


@civ('for_sale_sign', 'decor', 'civ_props', fp=(1.0, 0.3), yaw=45.0, front='S', catcher=10.0, samples=40,
     notes=('For-sale yard sign (faces the camera): white post + arm, a blank green-bordered board hanging on two '
            'chains, a little house with a heart on top. fxPoints.board / boardPx = where the game writes the text.'),
     ko='매물 표지판', en='For sale sign', zone='moving')
def b_for_sale_sign():
    yard_sign(False)
    return {'fx': {'board': (0.07, -0.05, 0.99)}, 'extra': {'boardPx': [int(0.58 * 64), int(0.38 * 0.866 * 64)]}}


@civ('sold_sign', 'decor', 'civ_props', fp=(1.0, 0.3), yaw=45.0, front='S', catcher=10.0, samples=40,
     notes=('Sold yard sign: the for-sale sign with a red diagonal ribbon across the board and a pink heart sticker '
            '(no baked text). Swap for_sale_sign -> sold_sign when somebody buys the house.'),
     ko='판매 완료 표지판', en='Sold sign', zone='moving')
def b_sold_sign():
    yard_sign(True)
    return {'fx': {'board': (0.07, -0.05, 0.99)}, 'extra': {'boardPx': [int(0.58 * 64), int(0.38 * 0.866 * 64)]}}


@civ('welcome_mat', 'decal', 'civ_props', fp=(0.9, 0.6), shadow=False, catcher=4.0, samples=32,
     notes=('Welcome mat (ground decal, 0.9 x 0.6 m, long side along world X = screen down-right): coir mat with a '
            'red border and a pink heart; put it at a doorPoint when a new family moves in. Ground layer.'),
     ko='환영 매트', en='Welcome mat', zone='moving')
def b_welcome_mat():
    box('mat', (0.9, 0.6, 0.025), (0, 0, 0), mat=L.stripes('#C9A36B', '#B8925A', 30.0, 'X', rough=0.95, soft=0.2),
        bevel=0.012)
    box('border', (0.92, 0.62, 0.02), (0, 0, 0), mat=flat('#C0392B', 0.85), bevel=0.01)
    hr = extrude('heart', [(x * 0.15, y * 0.15) for x, y in T.heart_pts(1.0, 32)], 0.008, top=flat('#E8749A', 0.7),
                 side=flat('#E8749A', 0.7), bevel=0.0)
    hr.location = (0, 0, 0.025)
    hr.rotation_euler = Euler((0, 0, math.radians(90)), 'XYZ')
    for k in range(4):
        sphere('dot', 0.025, (-0.32 + 0.21 * k, -0.2, 0.026), flat('#F2C14E', 0.7), scale=(1, 1, 0.3), segs=8,
               rings=4)
    return {}


def cbox(name, size, loc, rot_z=0.0, tape=True, arrows=True, seed=0, open_=False, snow=False):
    """Kraft cardboard box with tape and 'this side up' arrows printed in ink."""
    kraft = tonal('#C9A36B', 0.06, 4.0, rough=0.9)
    w, d, h = size
    objs = [box(name, size, (0, 0, 0), mat=kraft, bevel=0.015)]
    if tape:
        objs.append(box(name + '_tape', (w + 0.004, 0.08, 0.004), (0, 0, h), mat=flat('#E8D9B0', 0.4), bevel=0.0))
        objs.append(box(name + '_tape2', (0.004, 0.08, h * 0.35), (w / 2, 0, h * 0.65), mat=flat('#E8D9B0', 0.4),
                        bevel=0.0))
    if arrows:
        ink = flat('#5A4632', 0.8)
        for k in range(2):
            ar = extrude(name + '_ar', [(-0.03, 0.0), (0.03, 0.0), (0.03, 0.06), (0.06, 0.06), (0.0, 0.12),
                                        (-0.06, 0.06), (-0.03, 0.06)], 0.004, rot=(90, 0, 0), top=ink, side=ink,
                         bevel=0.0)
            ar.location = (-w * 0.2 + k * 0.14, -d / 2 - 0.002, h * 0.45)
            objs.append(ar)
    if open_:
        for s in (-1, 1):
            objs.append(box(name + '_flap', (w * 0.95, 0.02, d * 0.45), (0, s * d / 2, h), rot=(s * -60, 0, 0),
                            mat=kraft, bevel=0.005))
    if snow:
        objs.append(PA.snow_cap(name + '_sn', min(w, d) * 0.35, (w * 0.1, 0, h + 0.005), h=0.04, seed=seed,
                                scale=(1.2, 1.0, 1.0)))
    return L.group(objs, name + '_g', loc=loc, rot=(0, 0, rot_z))


@civ('moving_boxes_stack', 'decor', 'civ_moving', fp=(1.2, 0.9), catcher=10.0, samples=40,
     notes=('Moving boxes: a wobbly stack of taped kraft boxes with "this side up" arrows, one open with a lamp '
            'and a teddy peeking out, a little snow on top. Drop it by a door during a move-in / move-out '
            '(movers carry_box between the truck and here). dropPoint = where the next carried box lands.'),
     ko='이삿짐 상자 더미', en='Moving boxes stack', zone='moving')
def b_moving_boxes_stack():
    cbox('b0', (0.62, 0.48, 0.42), (-0.15, 0.05, 0.0), rot_z=4, seed=1)
    cbox('b1', (0.5, 0.42, 0.38), (0.38, -0.08, 0.0), rot_z=-8, seed=2)
    cbox('b2', (0.48, 0.4, 0.34), (-0.1, 0.08, 0.42), rot_z=-6, seed=3)
    cbox('b3', (0.36, 0.32, 0.28), (0.36, -0.02, 0.38), rot_z=12, seed=4, open_=True)
    cbox('b4', (0.3, 0.26, 0.22), (-0.06, 0.06, 0.76), rot_z=10, seed=5, snow=True)
    cyl('lampst', 0.02, 0.32, (0.4, 0.0, 0.62), mat=flat('#3D424C', 0.5), segs=8)
    cyl('lampsh', 0.1, 0.14, (0.4, 0.0, 0.9), mat=flat('#F2C14E', 0.6), r_top=0.06, segs=16, bevel=0.01)
    teddy('teddy', (0.28, -0.08, 0.58), s=0.7, rot_z=30)
    cbox('b5', (0.34, 0.3, 0.26), (-0.55, -0.32, 0.0), rot_z=25, seed=6)
    mark('drop', (0.75, -0.55, 0.0))
    return {}


def armchair(name, loc, rot_z=0.0, col='#E8B830', s=1.0):
    m = flat(col, 0.75)
    objs = [box(name + '_seat', (0.7 * s, 0.62 * s, 0.24 * s), (0, -0.02 * s, 0.14 * s), mat=m, bevel=0.08 * s),
            box(name + '_back', (0.7 * s, 0.2 * s, 0.6 * s), (0, 0.24 * s, 0.14 * s), mat=m, bevel=0.08 * s),
            box(name + '_cush', (0.5 * s, 0.46 * s, 0.1 * s), (0, -0.06 * s, 0.38 * s), mat=flat(hexmix(col, '#FFFFFF',
                                                                                                0.15), 0.75),
                bevel=0.04 * s)]
    for sx in (-1, 1):
        objs.append(box(name + '_arm', (0.14 * s, 0.62 * s, 0.42 * s), (sx * 0.31 * s, -0.02 * s, 0.14 * s), mat=m,
                        bevel=0.06 * s))
        for sy in (-1, 1):
            objs.append(cyl(name + '_leg', 0.03 * s, 0.14 * s, (sx * 0.28 * s, sy * 0.24 * s, 0.0),
                            mat=flat('#7A4E2E', 0.6), segs=8, r_top=0.022 * s))
    objs.append(PA.snow_cap(name + '_sn', 0.12 * s, (0.1 * s, 0.25 * s, 0.75 * s), h=0.04, seed=3))
    return L.group(objs, name, loc=loc, rot=(0, 0, rot_z))


def sofa(name, loc, rot_z=0.0, col='#3FA58C', s=1.0):
    m = flat(col, 0.75)
    objs = [box(name + '_seat', (1.5 * s, 0.66 * s, 0.24 * s), (0, -0.02 * s, 0.14 * s), mat=m, bevel=0.08 * s),
            box(name + '_back', (1.5 * s, 0.22 * s, 0.62 * s), (0, 0.24 * s, 0.14 * s), mat=m, bevel=0.08 * s)]
    for k in (-1, 1):
        objs.append(box(name + '_cush', (0.66 * s, 0.48 * s, 0.1 * s), (k * 0.36 * s, -0.06 * s, 0.38 * s),
                        mat=flat(hexmix(col, '#FFFFFF', 0.15), 0.75), bevel=0.04 * s))
        objs.append(box(name + '_arm', (0.16 * s, 0.66 * s, 0.44 * s), (k * 0.75 * s, -0.02 * s, 0.14 * s), mat=m,
                        bevel=0.07 * s))
    objs.append(sphere(name + '_pil', 0.13 * s, (-0.45 * s, 0.05 * s, 0.56 * s), flat('#F2C14E', 0.8),
                       scale=(1, 0.5, 0.9), segs=12, rings=8))
    for sx in (-1, 1):
        for sy in (-1, 1):
            objs.append(cyl(name + '_leg', 0.03 * s, 0.14 * s, (sx * 0.68 * s, sy * 0.26 * s, 0.0),
                            mat=flat('#7A4E2E', 0.6), segs=8, r_top=0.022 * s))
    objs.append(L.snow_slab(name + '_sn', 1.2 * s, 0.16 * s, 0.04, (0.05 * s, 0.25 * s, 0.76 * s), seed=4))
    return L.group(objs, name, loc=loc, rot=(0, 0, rot_z))


def floor_lamp(name, loc, col='#E8749A'):
    x, y, z = loc
    objs = [cyl(name + '_b', 0.13, 0.04, (x, y, z), mat=flat('#3D424C', 0.5), segs=16, bevel=0.01),
            cyl(name + '_p', 0.02, 1.25, (x, y, z + 0.04), mat=CL.brass(), segs=8),
            cyl(name + '_s', 0.22, 0.26, (x, y, z + 1.15), mat=flat(col, 0.8), r_top=0.14, segs=20, bevel=0.01)]
    mb = L.MB()
    for k in range(14):
        a = math.tau * k / 14
        mb.sphere(0.025, flat('#F2C14E', 0.6), loc=(x + 0.22 * math.cos(a), y + 0.22 * math.sin(a), z + 1.13), segs=6,
                  rings=4)
    objs.append(mb.done(name + '_fringe'))
    objs.append(PA.snow_cap(name + '_sn', 0.1, (x, y, z + 1.41), h=0.04, seed=2))
    return objs


def rolled_rug(name, loc, rot_z=0.0, col='#C0392B'):
    o = cyl(name, 0.12, 1.1, (0, 0, 0), rot=(0, 90, 0), mat=L.stripes(col, '#F2C14E', 6.0, 'X', soft=0.04),
            segs=18, origin='center', bevel=0.02, cap_mat=flat(hexmix(col, '#FFFFFF', 0.2), 0.8))
    return L.group([o], name + '_g', loc=(loc[0], loc[1], loc[2] + 0.12), rot=(0, 0, rot_z))


@civ('furniture_pile_s', 'decor', 'civ_moving', fp=(1.6, 1.2), catcher=12.0, samples=40,
     notes=('Small furniture pile on the snow (move-in / move-out): a mustard armchair, a pink fringed floor lamp, '
            'two boxes and a rolled-up rug.'), ko='가구 더미 (소)', en='Furniture pile S', zone='moving')
def b_furniture_pile_s():
    armchair('chair', (-0.25, 0.1, 0.0), rot_z=-15)
    floor_lamp('lamp', (0.5, 0.35, 0.0))
    cbox('b0', (0.46, 0.4, 0.36), (0.45, -0.3, 0.0), rot_z=10, seed=11)
    cbox('b1', (0.34, 0.3, 0.26), (0.42, -0.28, 0.36), rot_z=-5, seed=12, snow=True)
    rolled_rug('rug', (-0.3, -0.5, 0.0), rot_z=8)
    LA.snow_drift('d0', 0.16, (-0.75, 0.4, 0.0), seed=13)
    return {}


@civ('furniture_pile_l', 'decor', 'civ_moving', fp=(2.6, 1.7), catcher=16.0, samples=40,
     notes=('Big furniture pile on the snow: a teal sofa with a yellow pillow, an armchair, a fringed floor lamp, a '
            'stack of boxes, a potted plant, a framed painting leaning on the sofa and a rolled-up rug. '
            'furniture_pile = alias of this.'), ko='가구 더미 (대)', en='Furniture pile L', zone='moving')
def b_furniture_pile_l():
    sofa('sofa', (-0.35, 0.3, 0.0), rot_z=-6)
    armchair('chair', (0.85, 0.2, 0.0), rot_z=-30, col='#E8749A', s=0.9)
    floor_lamp('lamp', (-1.15, 0.55, 0.0), col='#F2C14E')
    cbox('b0', (0.5, 0.42, 0.4), (0.75, -0.5, 0.0), rot_z=8, seed=21)
    cbox('b1', (0.44, 0.38, 0.34), (0.72, -0.48, 0.4), rot_z=-6, seed=22)
    cbox('b2', (0.32, 0.28, 0.24), (0.76, -0.5, 0.74), rot_z=14, seed=23, snow=True)
    cbox('b3', (0.42, 0.36, 0.3), (1.15, -0.1, 0.0), rot_z=-20, seed=24)
    CL.potted_plant('plant', (-1.05, -0.35, 0.0), s=1.4, seed=25)
    pic = [box('pf', (0.62, 0.05, 0.48), (0, 0, 0), mat=flat('#C9A045', 0.35, 0.6), bevel=0.015),
           box('pp', (0.52, 0.03, 0.38), (0, -0.02, 0.05), mat=flat('#9CC7E6', 0.8), bevel=0.0),
           box('pm', (0.5, 0.032, 0.14), (0, -0.025, 0.05), mat=flat('#3E8E57', 0.8), bevel=0.0),
           sphere('psun', 0.05, (0.15, -0.04, 0.32), flat('#F2C14E', 0.5), scale=(1, 0.3, 1), segs=10, rings=6)]
    L.group(pic, 'painting', loc=(-0.1, -0.15, 0.08), rot=(-14, 0, 4))
    rolled_rug('rug', (0.1, -0.7, 0.0), rot_z=-4, col='#3D7CC9')
    LA.snow_drift('d0', 0.2, (1.3, 0.65, 0.0), seed=26)
    return {}


# =========================================================================== DEMOLITION FENCE (tiles)

FENCE_SEG = math.sqrt(2.0)
FENCE_NOTE = ('Demolition fence tile along world %s (one grid cell = sqrt(2) m, step %s px): white posts on little '
              'concrete feet with orange caps, an orange-and-white striped board on top and a yellow-and-black '
              'hazard board below, a bit of snow. The tile owns the post at its %s end; chain tiles at stepPx and '
              'close a chain with demolition_fence_post. Shadows join seamlessly (partition-of-unity cut like the '
              'rails). _lamp variant = same tile with an amber warning lamp clamped on the board (anims.blink 2 f). '
              'fenceRings (manifest top level) lists ready-made rings around S / M / L plots.')


def fence_segment(name, axis, lamp=False, cam=True):
    """One fence segment centred on the origin along X (rotated for Y), post at the -end."""
    white = flat('#F4F1EA', 0.55)
    orange = flat('#EE7F33', 0.5)
    stripe = L.stripes('#EE7F33', '#F4F1EA', 4.2, 'X', rough=0.5, soft=0.02)
    haz = L.stripes('#F2C230', '#2B2F3A', 7.0, 'X', rough=0.5, soft=0.02)
    h = FENCE_SEG / 2
    objs = [box(name + '_foot', (0.26, 0.2, 0.1), (-h, 0, 0), mat=flat('#9AA2AD', 0.7), bevel=0.03),
            box(name + '_post', (0.07, 0.07, 1.02), (-h, 0, 0.08), mat=white, bevel=0.015),
            cyl(name + '_cap', 0.06, 0.06, (-h, 0, 1.1), mat=orange, segs=12, bevel=0.015),
            box(name + '_top', (FENCE_SEG, 0.05, 0.2), (0, -0.05, 0.78), mat=stripe, bevel=0.015),
            box(name + '_low', (FENCE_SEG, 0.05, 0.14), (0, -0.05, 0.3), mat=haz, bevel=0.012),
            L.snow_slab(name + '_sn', FENCE_SEG * 0.7, 0.07, 0.03, (0.1, -0.05, 0.98), seed=3)]
    lamp_m = None
    if lamp:
        lamp_m = L.emissive(name + '_lamp', '#C98A2A', '#FFB23A', 0.0)
        objs.append(box(name + '_clamp', (0.12, 0.1, 0.08), (0.0, -0.05, 0.96), mat=flat('#2B2F3A', 0.5), bevel=0.01))
        objs.append(cyl(name + '_lampg', 0.075, 0.1, (0.0, -0.05, 1.04), mat=lamp_m, segs=16, r_top=0.06,
                        bevel=0.02))
        objs.append(cyl(name + '_lampc', 0.05, 0.03, (0.0, -0.05, 1.14), mat=flat('#2B2F3A', 0.5), segs=12,
                        bevel=0.01))
    for o in objs:
        if not cam:
            o.visible_camera = False
    g = L.group(objs, name, loc=(0, 0, 0), rot=(0, 0, 0 if axis == 'x' else 90))
    return g, lamp_m


def _fence_builder(axis, lamp=False):
    def fn():
        g, lamp_m = fence_segment('seg', axis, lamp=lamp)
        for k, off in enumerate((-1, 1)):                  # neighbours: shadow only (continuous shadow)
            ng, _ = fence_segment('nb%d' % k, axis, lamp=False, cam=False)
            if axis == 'x':
                ng.location = (off * FENCE_SEG, 0, 0)
            else:
                ng.location = (0, off * FENCE_SEG, 0)
        ext = {'tileAxis': axis, 'segM': round(FENCE_SEG, 4), 'stepPx': [64, 32] if axis == 'x' else [64, -32],
               'postEnd': '-' + axis, 'tileLayer': 'objects'}
        if lamp:
            def idle():
                L.set_emission(lamp_m, 0.0)

            def work(i):
                L.set_emission(lamp_m, [4.0, 0.0][i])
            idle()
            return {'idle': idle, 'work': work, 'extra': ext, 'fx': {'lamp': (0.0, -0.05, 1.05) if axis == 'x'
                                                                     else (0.05, 0.0, 1.05)}}
        return {'extra': ext}
    return fn


for _ax in ('x', 'y'):
    civ('demolition_fence_%s' % _ax, 'decor', 'civ_demo', fp=(FENCE_SEG, 0.3) if _ax == 'x' else (0.3, FENCE_SEG),
        catcher=8.0, samples=40, notes=FENCE_NOTE % (_ax.upper(), '(64, 32)' if _ax == 'x' else '(64, -32)',
                                                     '-' + _ax.upper()),
        ko='철거 가림막 (%s)' % _ax, en='Demolition fence %s' % _ax, zone='demolition')(_fence_builder(_ax))
    civ('demolition_fence_%s_lamp' % _ax, 'decor', 'civ_demo', fp=(FENCE_SEG, 0.3) if _ax == 'x' else
        (0.3, FENCE_SEG), catcher=8.0, samples=40, work=2, fps=3, anim_name='blink',
        notes=FENCE_NOTE % (_ax.upper(), '(64, 32)' if _ax == 'x' else '(64, -32)', '-' + _ax.upper()),
        ko='철거 가림막 경고등 (%s)' % _ax, en='Demolition fence %s with lamp' % _ax,
        zone='demolition')(_fence_builder(_ax, lamp=True))


@civ('demolition_fence_post', 'decor', 'civ_demo', fp=('r', 0.15), catcher=6.0, samples=40,
     notes='Single demolition fence post (closes a chain of fence tiles / the last corner of a ring).',
     ko='철거 가림막 기둥', en='Demolition fence post', zone='demolition')
def b_demolition_fence_post():
    white = flat('#F4F1EA', 0.55)
    box('foot', (0.26, 0.2, 0.1), (0, 0, 0), mat=flat('#9AA2AD', 0.7), bevel=0.03)
    box('post', (0.07, 0.07, 1.02), (0, 0, 0.08), mat=white, bevel=0.015)
    cyl('cap', 0.06, 0.06, (0, 0, 1.1), mat=flat('#EE7F33', 0.5), segs=12, bevel=0.015)
    PA.snow_cap('sn', 0.05, (0, 0, 1.16), h=0.03, seed=4)
    return {}
