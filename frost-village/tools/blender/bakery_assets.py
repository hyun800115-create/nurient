"""
bakery_assets.py - v4.3 「밀밭 · 빵집」 art (scratchpad spec v43/bakery/spec.md §6): the bakery cottage (back + front
layers), its bread stall (back + front layers + two stock overlays), and the wheat field's 농막 and field props
(scarecrow with a scarf, a sled cart of sheaves, the wheat pile's sacks).  Built with the SAME helpers, palette, camera,
light and PPU as the props / v3 buildings / the market stalls / the deck (prop_lib, prop_assets, life_assets,
bld_assets, market_assets are imported READ-ONLY).  bakery_render.py renders them into <tmp>/fv_cache/bakery43,
bakery_pack.py packs assets/bakery43/.

Conventions (as prop_assets / bld_assets): 1 unit = 1 m, origin = footprint centre = sprite anchor, front = -Y (screen
down-left), +X = screen down-right.  Plaza metres map straight onto these axes (+X right-down, +Y right-up).

  * bakery43 (2.6 x 2.6 m cottage, gable end facing -Y, ridge along Y): eaves 2.05 m at the wall line (1.92 m at the
    overhang edge), ridge 2.9 m (+ ridge log), brick chimney on the left slope near the front (top 3.56 m).  A wide
    front opening (bx -1.15 .. +1.15) up to the lintel at 1.9 m: a low sill (0.9 m) across bx -1.15 .. +0.2, the doorway
    bx 0.2 .. 1.1 open to the floor; the front half of the right (+X) wall is a low ledge (0.75 m) open above, so the
    baker at her post (bx 0.1, by -0.1) is seen standing on the floor inside.  Inside: a brick plinth + clay dome oven in
    the front-left corner whose mouth faces +X (screen down-right, toward the baker and the doorway), an EMPTY kneading
    table along the right wall (top 0.50 m, the baker's knead board lands on it), empty shelves, a peel on the back
    wall, flour sacks, a log stack.  Blank sign board on the front gable (the game writes sign_bakery43).
    Back layer = everything; front layer (object mask) = the front sill + its flower box, the lower 0.9 m of the
    front-left corner post and the door jamb post, and the right ledge (0.75 m) with its corner pier.
  * bakery43_stall (1.6 x 0.7 m): two back posts + a blank board on top (sign_stall43), a low back shelf with empty
    baskets, a 10 cm plank step; front layer = the 0.6 m counter with an EMPTY sloped bread case on the customer side
    (case top 0.74 m).  Two stock overlays cut from renders with loaves on the case: bakery43_bread_1 (3 loaves + a
    baguette) and bakery43_bread_2 (a full case + a basket of rolls), same frame + anchor as the stall.
  * farm43_hut (농막, 2.0 x 1.6 m), farm43_scarecrow, farm43_sledcart, farm43_sacks: decor.
Ghost-sweep rule: no bread, dough or wheat on the cottage or the stall frames (the stall's stock is the overlays).
Not run directly.
"""
import math
from collections import OrderedDict

import bpy  # noqa: F401  (import before mathutils when bpy is a module)
from mathutils import Vector

import prop_lib as L
from prop_lib import flat, tonal, box, cyl, blob, sphere, extrude
import prop_assets as PA
import life_assets as LA
import bld_assets as BA
import market_assets as MA

BAKERY43 = OrderedDict()

# ---- the cottage (bakery-local metres, spec §3.3)
HW = 1.3                 # half width / depth of the 2.6 x 2.6 footprint
WALL_T = 0.12
WALL_TOP = 2.05          # wall line (eaves at the wall)
RIDGE = 2.9
OVER = 0.2
LINTEL = 1.9
SILL_H = 0.9
LEDGE_H = 0.75
DOOR = (0.2, 1.1)        # doorway bx range
POST = (0.1, -0.1)       # the baker's post (staffPoints[0] = [0, 5])
OVEN = (-0.72, -0.60)    # oven dome centre; its mouth faces +X
OVEN_R = 0.42
OVEN_Z0 = 0.46           # plinth top = oven floor
TABLE = (0.29, 0.91, -0.60, 0.45)    # kneading table x0, x1, y0, y1 (top 0.50 m)
TABLE_Z = 0.50
CHIMNEY = (-0.62, -0.70)

# ---- the stall (stall-local metres)
ST_STEP = 0.10
ST_COUNTER = 0.60
ST_CASE_TOP = 0.74

PLASTER = '#F3E7CF'
TIMBER = '#6E4428'
STONE = '#9AA1AB'
ROOF = ('#B5523B', '#9E4430')


def item(key, fp, samples=56, catcher=16.0, notes='', yaw=0.0, kind='building', shadow=True):
    """Register a builder (same spec fields as bld_assets.bld, so bld_render.render_build can render it)."""
    def deco(fn):
        BAKERY43[key] = dict(key=key, fn=fn, kind=kind, atlas='bakery43', fp=fp, yaw=yaw, shadow=shadow,
                             samples=samples, notes=notes, front='-Y', catcher=catcher, work=0, fps=8, item=None,
                             sprites=None, extra={})
        return fn
    return deco


# =========================================================================== small parts

def wood(c='#9A6A42', v=0.1):
    return tonal(c, v, 5.0, rough=0.82)


def timber():
    return flat(TIMBER, 0.8)


def plaster():
    return tonal(PLASTER, 0.05, 3.0, rough=0.9)


def stone():
    return L.brick(STONE, '#8A919C', '#C7CDD5', scale=3.2, row_h=0.42, brick_w=0.6, snow_top=False)


def flower_box(name, loc, w=0.8, seed=0):
    """A wooden window box with evergreen sprigs and red berries under a little snow (winter cheer)."""
    x, y, z = loc
    box(name, (w, 0.18, 0.16), (x, y, z), mat=wood('#8A5A36', 0.08), bevel=0.02)
    box(name + '_lip', (w + 0.04, 0.2, 0.03), (x, y, z + 0.15), mat=wood('#6E4428', 0.06), bevel=0.01)
    green = flat('#2E6B4F', 0.8)
    green2 = flat('#3F8A5E', 0.8)
    rnd = L.rng(seed)
    n = int(w / 0.11)
    for i in range(n):
        xx = x - w / 2 + 0.07 + i * (w - 0.14) / max(1, n - 1)
        blob(name + '_g%d' % i, 0.07, (xx, y + rnd.uniform(-0.02, 0.02), z + 0.18), green if i % 2 else green2,
             scale=(1.1, 0.9, 0.85), seed=seed * 13 + i, amp=0.25, subdiv=2)
    berry = flat('#D9382F', 0.35)
    for i in range(max(3, n // 2)):
        xx = x - w / 2 + 0.12 + i * (w - 0.24) / max(1, max(3, n // 2) - 1)
        sphere(name + '_b%d' % i, 0.022, (xx + rnd.uniform(-0.02, 0.02), y - 0.06, z + 0.25 + rnd.uniform(0, 0.03)),
               berry, segs=10, rings=6)
    L.snow_slab(name + '_snow', w - 0.1, 0.14, 0.04, (x, y, z + 0.27), seed=seed + 3, droop=0.01)


def sheaf(name, loc, length=0.62, r=0.085, yaw=0.0, lie=True, seed=0, snow=0.0):
    """A tied wheat sheaf: a bundle of straw stalks with the ears flared at one end and a twine band.  lie=True lays it
    along its local +X (ears at +X); yaw turns it."""
    stalk = L.stripes('#E2B85A', '#C9993E', 26.0, 'Z', rough=0.9, soft=0.3)
    ears = tonal('#D6A548', 0.18, 14.0, rough=0.85)
    band = flat('#8A5A33', 0.8)
    objs = [cyl(name + '_st', r, length * 0.72, (0, 0, 0), mat=stalk, segs=14, r_top=r * 0.86, bevel=0.01,
                cap_mat=flat('#B88A3A', 0.9))]
    objs.append(blob(name + '_ear', r * 1.35, (0, 0, length * 0.8), ears, scale=(1.0, 1.0, 1.25), seed=seed, amp=0.3,
                     freq=3.0, subdiv=2))
    objs.append(cyl(name + '_band', r * 0.94, 0.04, (0, 0, length * 0.42), mat=band, segs=14, bevel=0.005))
    if snow:
        # (lying: local -X ends up on top after the 90 deg turn about Y)
        loc_sn = (-r * 0.92, 0.0, length * 0.5) if lie else (0.0, 0.0, length * 0.86)
        objs.append(PA.snow_cap(name + '_sn', r * 1.05, loc_sn, 0.03, seed, scale=(1.0, 0.8, 1.6) if lie else (1, 1, 1)))
    g = L.group(objs, name)
    if lie:
        g.rotation_euler = (0.0, math.radians(90), math.radians(yaw))
    else:
        g.rotation_euler = (0.0, 0.0, math.radians(yaw))
    g.location = loc
    return g


def hanging_peel(name, loc, h=1.05):
    """An empty bread peel hanging upright on a wall (+Y wall: the blade faces -Y)."""
    x, y, z = loc
    box(name + '_blade', (0.26, 0.025, 0.3), (x, y, z), mat=wood('#D9A867', 0.06), bevel=0.012)
    cyl(name + '_h', 0.018, h - 0.3, (x, y, z + 0.3), mat=wood('#A8743F', 0.06), segs=10, bevel=0.005)
    cyl(name + '_peg', 0.02, 0.08, (x, y + 0.05, z + h - 0.12), rot=(90, 0, 0), mat=timber(), segs=8,
        origin='center')


# =========================================================================== the cottage

def _gable(name, y, mat, thick=0.12):
    """Triangular gable wall at y (spans x in [-HW, HW]) from WALL_TOP to RIDGE; faces -Y when y < 0."""
    g = extrude(name, [(-HW - 0.01, 0.0), (HW + 0.01, 0.0), (0.0, RIDGE - WALL_TOP + 0.02)], thick, rot=(90, 0, 0),
                top=mat, side=mat, bevel=0.015)
    g.location = (0.0, y + thick / 2, WALL_TOP - 0.01)
    return g


def _timber_x(name, x, y0, y1, z0, z1, posts, braces=()):
    """Timber framing on a +X face at x: sill + plate beams, posts at the y's, diagonal braces [(ya, yb)]."""
    t = 0.085
    bm = timber()
    box(name + '_sill', (t, y1 - y0 + 0.04, t), (x, (y0 + y1) / 2, z0), mat=bm, bevel=0.012)
    box(name + '_plate', (t, y1 - y0 + 0.04, t), (x, (y0 + y1) / 2, z1 - t), mat=bm, bevel=0.012)
    for yy in posts:
        box(name + '_post', (t, t, z1 - z0), (x, yy, z0), mat=bm, bevel=0.012)
    for ya, yb in braces:
        ln = math.hypot(yb - ya, z1 - z0 - t)
        ang = math.degrees(math.atan2(z1 - z0 - t, yb - ya))
        box(name + '_br', (t * 0.8, ln - 0.06, t * 0.8), (x + 0.004, (ya + yb) / 2, (z0 + z1 - t) / 2), rot=(-ang, 0, 0),
            mat=bm, bevel=0.01, origin='center')


def _oven():
    cx, cy = OVEN
    plinth = L.brick('#8E7A6E', '#7A665A', '#CBBFB2', scale=3.4, row_h=0.4, brick_w=0.62, snow_top=False)
    box('oven_plinth', (0.9, 0.9, OVEN_Z0), (cx + 0.02, cy, 0.03), mat=plinth, bevel=0.03)
    box('oven_lip', (0.96, 0.96, 0.05), (cx + 0.02, cy, OVEN_Z0 - 0.03), mat=flat('#B9AFA4', 0.8), bevel=0.015)
    clay = tonal('#C8764B', 0.14, 6.0, rough=0.8)
    Rd, Hd, z0 = OVEN_R, 0.5, OVEN_Z0

    def prof(j, k):
        th = math.tau * j / 40
        ph = math.radians([0, 14, 28, 42, 56, 70, 82][k])
        r = Rd * math.cos(ph) * (1.0 + 0.05 * math.sin(2 * ph))
        return (cx + r * math.cos(th), cy + r * math.sin(th), z0 + Hd * math.sin(ph))
    L.revolve('oven_dome', prof, 40, 7, mat=clay, top=(cx, cy, z0 + Hd), bottom=(cx, cy, z0))
    # the mouth faces +X (psi 90): a clay vault, a stone arch around a glowing ember opening
    psi = 90.0
    fd = PA.facing_dir(psi)
    base = Vector((cx, cy, z0))
    vault = extrude('oven_vault', PA.arch_pts(0.46, 0.42), 0.2, rot=PA.facing_rot(psi), top=clay, side=clay,
                    bevel=0.03)
    vault.location = tuple(base + fd * (Rd - 0.12))
    glow_m = L.emissive('oven_mouth', '#5A1E10', '#FF8A2A', 2.2)
    mouth = extrude('oven_mouth', PA.arch_pts(0.3, 0.3), 0.02, rot=PA.facing_rot(psi), top=glow_m, side=glow_m,
                    bevel=0.0)
    mouth.location = tuple(base + fd * (Rd + 0.075) + Vector((0, 0, 0.01)))
    PA.voussoir_arch('oven_vous', tuple(base + fd * (Rd + 0.04)), psi, 0.34, 0.32, depth=0.08, block=0.09, n=7,
                     mat=flat('#E2D6C4', 0.8))
    mouth_c = base + fd * (Rd + 0.09) + Vector((0, 0, 0.12))
    L.point_light('oven_glow', tuple(base + fd * (Rd + 0.25) + Vector((0, 0, 0.18))), 'fire', 9.0, 0.15)
    # soot on the dome top + a little iron door leaning on the plinth
    cyl('oven_soot', 0.12, 0.02, (cx, cy, z0 + Hd - 0.02), mat=flat('#6E4A3A', 0.9), segs=18, bevel=0.0)
    return mouth_c


def _interior():
    floor = L.stripes('#C99A66', '#B88A58', 9.0, 'X', rough=0.85, soft=0.05)
    box('floor', (2.4, 2.4, 0.03), (0.0, 0.0, 0.0), mat=floor, bevel=0.0)
    # back wall inner wainscot + two EMPTY shelves (baskets, crocks, folded cloths - no bread)
    box('wainscot', (2.36, 0.03, 0.8), (0.0, HW - WALL_T - 0.015, 0.03), mat=L.stripes('#B07C48', '#9E6C3C', 9.0, 'X',
                                                                                         soft=0.03), bevel=0.0)
    shelf = flat('#9A6436', 0.8)
    for z in (1.02, 1.46):
        box('shelf', (1.25, 0.24, 0.04), (0.1, HW - WALL_T - 0.13, z), mat=shelf, bevel=0.01)
        for sx in (-0.5, 0.7):
            box('shelf_br', (0.04, 0.2, 0.12), (sx, HW - WALL_T - 0.11, z - 0.12), mat=shelf, bevel=0.008)
    MA.basket('bk_bask1', (-0.3, HW - WALL_T - 0.13, 1.06), r=0.1, h=0.1)
    MA.crock('bk_crock', (0.1, HW - WALL_T - 0.13, 1.06), r=0.07, h=0.14)
    MA.cloths('bk_cloth', (0.48, HW - WALL_T - 0.13, 1.06), n=2)
    for k, c in enumerate(('#4F74A6', '#D9A93C', '#4F8A5B')):
        cyl('bk_jar%d' % k, 0.055, 0.13, (-0.32 + k * 0.17, HW - WALL_T - 0.13, 1.5), mat=flat(c, 0.35), segs=16,
            bevel=0.01, cap_mat=flat('#F2E8D2', 0.6))
    MA.basket('bk_bask2', (0.55, HW - WALL_T - 0.13, 1.5), r=0.1, h=0.1)
    hanging_peel('bk_peel', (0.86, HW - WALL_T - 0.03, 0.75), h=1.0)
    # flour sacks + a log stack in the back-left corner
    BA.sack('bk_sack1', (-0.88, 0.86, 0.03), s=0.95, col='#ECE2CB', seed=3, tie='#3D7CC9')
    BA.sack('bk_sack2', (-0.6, 0.98, 0.03), s=0.8, col='#E2D6BC', seed=4, tie='#C8463D')
    PA.log_pile('bk_logs', 3, 0.08, 0.5, (-0.98, 0.18, 0.03), seed=6, snow=False, axis='Y')
    # the kneading table along the right wall: an EMPTY floured top (the baker's board + dough are in her frames)
    x0, x1, y0, y1 = TABLE
    top = tonal('#E2B47A', 0.06, 3.0, rough=0.7)
    box('table_top', (x1 - x0, y1 - y0, 0.06), ((x0 + x1) / 2, (y0 + y1) / 2, TABLE_Z - 0.06), mat=top, bevel=0.015)
    flour = flat('#FBF8F2', 0.9)
    for (fx, fy, rx, ry) in ((0.72, 0.18, 0.08, 0.05), (0.52, -0.42, 0.06, 0.04), (0.8, -0.2, 0.05, 0.035)):
        sphere('table_flour', 1.0, (fx, fy, TABLE_Z + 0.002), flour, scale=(rx, ry, 0.004), segs=14, rings=6)
    leg = flat('#8A5A36', 0.8)
    for xx in (x0 + 0.04, x1 - 0.04):
        for yy in (y0 + 0.04, y1 - 0.04):
            box('table_leg', (0.06, 0.06, TABLE_Z - 0.06), (xx, yy, 0.0), mat=leg, bevel=0.01)
    box('table_shelf', (x1 - x0 - 0.08, y1 - y0 - 0.1, 0.03), ((x0 + x1) / 2, (y0 + y1) / 2, 0.12), mat=leg,
        bevel=0.008)
    cyl('table_crock', 0.08, 0.16, (0.62, 0.3, 0.15), mat=flat('#E8E0D2', 0.6), segs=16, bevel=0.01,
        cap_mat=flat('#FBF8F2', 0.9))
    L.point_light('bk_inside', (0.15, 0.35, 1.55), 'glow', 16.0, 0.35)


NOTE_BAKERY = ('눈꽃 빵집 cottage (v4.3 bakery split, spec §3.3 / §6.1): 2.6 x 2.6 m, gable end facing -Y, snowy terracotta '
               'roof (eaves 2.05 m, ridge 2.9 m), brick chimney on the left slope (fxPoints.chimney = smoke). A wide '
               'front opening: low sill bx -1.15..0.2, doorway bx 0.2..1.1 (doorPoint = the chief\'s 서서 빵 굽기 pad '
               'W), the right wall\'s front half a 0.75 m ledge open above. Inside: brick-and-clay oven in the '
               'front-left corner, mouth facing +X (fxPoints.ovenMouth = 0.55 m up at the mouth: loaves fly from '
               'here, the fire fx sits here), an EMPTY kneading table along the right wall (top 0.50 m), empty '
               'shelves, a peel on the wall. Draw bakery43_back (depth A.y), the baker at staffPoints[0] (A.y + 0.5), '
               'bakery43_front (A.y + 1: the sill + flower box, the lower 0.9 m of the front-left corner post and of '
               'the door jamb, the right ledge + its corner pier). Blank sign board: the game writes sign_bakery43 '
               'into signQuad. No bread, dough or wheat painted (ghost-sweep rule).')


@item('bakery43', fp=(2.6, 2.6), samples=64, catcher=18.0, notes=NOTE_BAKERY)
def b_bakery43():
    st, pl, tm = stone(), plaster(), timber()
    _interior()
    mouth_c = _oven()
    # ---------------------------------------------------------------- walls (back layer)
    box('foot_l', (0.18, 2.66, 0.22), (-HW + 0.06, 0.0, 0.0), mat=st, bevel=0.02)
    box('foot_b', (2.66, 0.18, 0.22), (0.0, HW - 0.06, 0.0), mat=st, bevel=0.02)
    box('foot_rb', (0.18, 1.5, 0.22), (HW - 0.06, 0.58, 0.0), mat=st, bevel=0.02)
    box('wall_l', (WALL_T, 2.6, WALL_TOP - 0.22), (-HW + 0.06, 0.0, 0.22), mat=pl, bevel=0.015)
    box('wall_b', (2.6, WALL_T, WALL_TOP - 0.22), (0.0, HW - 0.06, 0.22), mat=pl, bevel=0.015)
    box('wall_rb', (WALL_T, 1.45, WALL_TOP - 0.22), (HW - 0.06, 0.575, 0.22), mat=pl, bevel=0.015)
    _timber_x('tx', HW + 0.005, -0.15, HW, 0.22, WALL_TOP, posts=(-0.13, 0.27, HW - 0.04), braces=((-0.13, 0.27),))
    BA.window('bk_win', (HW + 0.01, 0.8, 1.62), 'x+', w=0.46, h=0.48, glow=2.0, shutters='#4F8A5B', seed=21)
    # lintels over the front opening and over the open right-front half (the corner has no post: the baker shows)
    box('lintel_f', (2.66, 0.16, 0.16), (0.0, -HW + 0.05, LINTEL), mat=tm, bevel=0.02)
    box('lintel_r', (0.16, 1.22, 0.16), (HW - 0.05, -0.72, LINTEL), mat=tm, bevel=0.02)
    # corner post (front-left) and door jamb: upper parts here, lower parts in the front layer
    for nm, x in (('post_fl', -HW + 0.07), ('jamb', DOOR[0] + 0.02)):
        box(nm + '_up', (0.13, 0.13, LINTEL - SILL_H), (x, -HW + 0.06, SILL_H), mat=tm, bevel=0.015)
    # gables, roof, ridge snow, chimney
    _gable('gable_f', -HW + 0.06, pl)
    _gable('gable_b', HW - 0.06, pl)
    box('gable_king', (0.08, 0.06, RIDGE - WALL_TOP - 0.2), (0.0, -HW - 0.0, WALL_TOP + 0.02), mat=tm, bevel=0.01)
    roofm = L.stripes(ROOF[0], ROOF[1], 7.0, 'Y', rough=0.8, soft=0.05)
    r_objs = BA.gable_roof('roof', 2 * HW + 2 * OVER, 2 * HW, WALL_TOP, RIDGE, OVER, roofm, snow_frac=(0.6, 0.6),
                           seed=31, thick=0.1, ridge_col='#7A3528')
    BA.regroup(r_objs, 'roof_grp', rot=(0, 0, 90))
    # barge boards along the front gable edge
    slope = (RIDGE - WALL_TOP) / HW
    for sx in (-1, 1):
        ln = math.hypot(HW + OVER, (HW + OVER) * slope)
        ang = math.degrees(math.atan2((HW + OVER) * slope, HW + OVER))
        box('barge', (ln, 0.06, 0.12), (sx * (HW + OVER) / 2, -HW - OVER + 0.02,
                                        RIDGE + 0.06 - (HW + OVER) / 2 * slope - 0.05), rot=(0, sx * ang, 0),
            mat=flat('#F2EDE2', 0.7), bevel=0.012, origin='center')
    chx, chy = CHIMNEY
    box('chimney', (0.34, 0.34, 1.25), (chx, chy, 2.2), mat=L.brick(scale=3.2, row_h=0.4, snow_top=False), bevel=0.03)
    box('chimcap', (0.42, 0.42, 0.07), (chx, chy, 3.45), mat=flat('#8E96A3', 0.7), bevel=0.02)
    L.snow_slab('chimsnow', 0.36, 0.36, 0.04, (chx, chy, 3.52), seed=33, droop=0.01)
    # the blank sign board on the front gable (faces -Y; the game writes the name)
    SW, SH, SB = 1.36, 0.33, 1.93          # over the lintel: the roof's barge boards hide anything higher at the ends
    sy = -HW - 0.06
    box('sign_back', (SW + 0.12, 0.05, SH + 0.12), (0.0, sy + 0.015, SB - 0.06), mat=tm, bevel=0.014)
    box('sign_face', (SW, 0.04, SH), (0.0, sy - 0.01, SB), mat=tonal('#EEDDB8', 0.04, 2.0), bevel=0.008)
    L.snow_slab('sign_snow', SW + 0.06, 0.09, 0.035, (0.0, sy - 0.01, SB + SH + 0.04), seed=34, droop=0.01)
    fy = sy - 0.032
    for (x, z) in ((-SW / 2 + 0.05, SB + SH - 0.035), (SW / 2 - 0.05, SB + SH - 0.035), (SW / 2 - 0.05, SB + 0.035),
                   (-SW / 2 + 0.05, SB + 0.035)):
        BA.mark('sign', (x, fy, z))
    # threshold stone, lantern at the door jamb, snow drifts
    box('threshold', (0.98, 0.34, 0.06), ((DOOR[0] + DOOR[1]) / 2 + 0.04, -HW - 0.14, 0.0),
        mat=L.snowy('stone', lo=0.6, hi=0.8), bevel=0.02)
    box('lan_arm', (0.04, 0.26, 0.04), (DOOR[0] + 0.02, -HW - 0.07, 1.72), mat=tm, bevel=0.01)
    PA.lantern('lan', (DOOR[0] + 0.02, -HW - 0.2, 1.46), 0.13, 3.0)
    LA.snow_drift('d_lb', 0.22, (-HW - 0.12, HW - 0.4, 0.0), seed=35)
    LA.snow_drift('d_rb', 0.2, (HW + 0.1, HW - 0.3, 0.0), seed=36, scale=(1.2, 1.0, 0.3))
    # ---------------------------------------------------------------- front layer
    with L.Collect() as front:
        x0, x1 = -HW + 0.13, DOOR[0] - 0.04
        box('sill_foot', (x1 - x0 + 0.16, 0.18, 0.22), ((x0 + x1) / 2, -HW + 0.06, 0.0), mat=st, bevel=0.02)
        box('sill_wall', (x1 - x0, WALL_T, SILL_H - 0.28), ((x0 + x1) / 2, -HW + 0.06, 0.22), mat=pl, bevel=0.015)
        box('sill_cap', (x1 - x0 + 0.2, 0.22, 0.06), ((x0 + x1) / 2, -HW + 0.05, SILL_H - 0.06), mat=wood('#8A5A36', 0.08),
            bevel=0.015)
        L.snow_slab('sill_snow', x1 - x0 + 0.1, 0.16, 0.035, ((x0 + x1) / 2, -HW + 0.05, SILL_H), seed=37, droop=0.01)
        flower_box('fbox', ((x0 + x1) / 2 - 0.05, -HW - 0.13, 0.5), w=0.86, seed=38)
        for nm, x in (('post_fl', -HW + 0.07), ('jamb', DOOR[0] + 0.02)):
            box(nm + '_lo', (0.13, 0.13, SILL_H), (x, -HW + 0.06, 0.0), mat=tm, bevel=0.015)
        # the right ledge (front half of the +X wall) and its corner pier
        ly0, ly1 = -HW + 0.02, -0.15
        box('ledge_foot', (0.18, ly1 - ly0, 0.22), (HW - 0.06, (ly0 + ly1) / 2, 0.0), mat=st, bevel=0.02)
        box('ledge_wall', (WALL_T, ly1 - ly0, LEDGE_H - 0.28), (HW - 0.06, (ly0 + ly1) / 2, 0.22), mat=pl, bevel=0.015)
        box('ledge_cap', (0.22, ly1 - ly0 + 0.08, 0.06), (HW - 0.05, (ly0 + ly1) / 2, LEDGE_H - 0.06),
            mat=wood('#8A5A36', 0.08), bevel=0.015)
        L.snow_slab('ledge_snow', 0.16, ly1 - ly0, 0.035, (HW - 0.05, (ly0 + ly1) / 2, LEDGE_H), seed=39, droop=0.01)
        box('pier', (0.14, 0.14, LEDGE_H), (HW - 0.07, -HW + 0.07, 0.0), mat=tm, bevel=0.015)
        LA.snow_drift('d_f', 0.16, (-HW + 0.1, -HW - 0.22, 0.0), seed=40, scale=(1.4, 0.9, 0.3))
    # ---------------------------------------------------------------- markers
    BA.mark('staff', (POST[0], POST[1], 0.0), facing=(1, 0, 0))
    BA.mark('door', (0.5, -0.95, 0.0), facing=(-1, -1, 0))
    BA.mark('in', (2.0, 0.3, 0.0))
    BA.mark('out', (2.0, -1.2, 0.0))
    return {'front': front.objs, 'frames': [('bakery43_back', None)],
            'sprites': {'bakery43_back': {'frame': 'bakery43_back'}},
            'fx': {'ovenMouth': tuple(mouth_c), 'chimney': (chx, chy, 3.62), 'sign': (0.0, sy - 0.03, SB + SH / 2),
                   'lantern': (DOOR[0] + 0.02, -HW - 0.2, 1.55)}}


# =========================================================================== the bread stall

CASE_TILT = math.degrees(math.atan2(0.075, 0.31))


def _tilt(g, yaw, tilt=CASE_TILT):
    """turn about Z first, then tilt with the case slope (about world X)"""
    g.rotation_mode = 'ZXY'
    g.rotation_euler = (math.radians(tilt), 0.0, math.radians(yaw))
    return g


def _loaf(name, loc, yaw, s=0.42, seed=0, tilt=CASE_TILT):
    return _tilt(PA.bread_model(name, loc=loc, scale=s), yaw, tilt)


def _baguette(name, loc, yaw, s=1.0, tilt=CASE_TILT):
    return _tilt(PA.bread_model(name, L_=0.7 * s, W=0.15 * s, H=0.12 * s, loc=loc, scale=1.0), yaw, tilt)


def _case_z(y):
    """Height of the sloped case surface at stall-local y (front lip y -0.33 -> back y -0.02)."""
    t = (y + 0.33) / 0.31
    return ST_COUNTER + 0.035 + t * (ST_CASE_TOP - 0.03 - ST_COUNTER - 0.035)


NOTE_STALL = ('빵집 가판대 (v4.3 bakery split, spec §3.3 / §6.1): 1.6 x 0.7 m, faces -Y. Back layer = two back posts with a '
              'blank board on top (the game writes sign_stall43 into signQuad), a low back shelf with EMPTY baskets, a '
              '10 cm plank step; front layer bakery43_stall_front = the 0.6 m counter with an EMPTY sloped bread case '
              '(top 0.74 m) on the customer side. Draw back (d), the clerk at staffPoints[0] lifted stepLiftPx '
              '(d + 0.5), front (d + 1), then the stock overlay (bakery43_bread_1 when 1 <= stock < fullAt, '
              'bakery43_bread_2 from fullAt; none when empty). fxPoints.case = where the loaves land. No awning (G6).')


@item('bakery43_stall', fp=(1.6, 0.7), samples=64, catcher=10.0, notes=NOTE_STALL)
def b_stall():
    post = flat('wood_mid', 0.8)
    dark = flat('wood_dark', 0.8)
    trim = flat('#7A4A2A', 0.8)
    # ---------------------------------------------------------------- back layer
    MA.plank_top('st_step', (1.5, 0.64, ST_STEP), (0.0, 0.39, 0.0), c1='#B98450', c2='#A6733F')
    box('st_riser', (1.52, 0.05, ST_STEP - 0.02), (0.0, 0.07, 0.0), mat=dark, bevel=0.01)
    PY = 0.62             # the posts stand beside / behind the clerk: the cottage front is 0.8 m behind the stall centre
    TOP = 2.08
    for sx in (-1, 1):
        cyl('st_post', 0.075, TOP + 0.08, (sx * 0.74, PY, 0.0), mat=post, segs=14)
        PA.snow_cap('st_post_sn', 0.08, (sx * 0.74, PY, TOP + 0.08), h=0.05, seed=50 + sx)
        box('st_foot', (0.18, 0.18, 0.07), (sx * 0.74, PY, 0.0), mat=dark, bevel=0.02)
    SW, SH, SB = 1.24, 0.3, TOP - 0.34
    box('st_sign_back', (SW + 0.06, 0.05, SH + 0.06), (0.0, PY + 0.03, SB - 0.03), mat=dark, bevel=0.012)
    box('st_sign_face', (SW, 0.04, SH), (0.0, PY - 0.01, SB), mat=tonal('#EEDDB8', 0.04, 2.0), bevel=0.008)
    for z in (SB - 0.03, TOP - 0.04):
        box('st_sign_rail', (SW + 0.12, 0.07, 0.06), (0.0, PY - 0.03, z), mat=trim, bevel=0.012)
    L.snow_slab('st_sign_snow', SW + 0.1, 0.11, 0.05, (0.0, PY - 0.03, TOP + 0.02), seed=52, droop=0.02)
    # an evergreen garland swagged under the board, red bows at the posts (cozy winter stall)
    green, green2 = flat('#2E6B4F', 0.8), flat('#3F8A5E', 0.8)
    n = 11
    for k in range(n):
        t = k / (n - 1)
        x = -0.7 + 1.4 * t
        z = SB - 0.07 - 0.13 * math.sin(math.pi * t)
        blob('st_gar%d' % k, 0.06, (x, PY - 0.07, z), green if k % 2 else green2, scale=(1.3, 0.9, 0.9), seed=55 + k,
             amp=0.3, subdiv=2)
        if k % 3 == 1:
            sphere('st_berry%d' % k, 0.022, (x, PY - 0.13, z - 0.02), flat('#D9382F', 0.35), segs=10, rings=6)
    for sx in (-1, 1):
        box('st_bow', (0.13, 0.04, 0.09), (sx * 0.72, PY - 0.1, SB - 0.1), mat=flat('#C8402F', 0.6), bevel=0.02,
            taper=(1.0, 1.0))
    # a little wheat-ear free emblem: two white snowflake rosettes at the board ends
    for sx in (-1, 1):
        cyl('st_rosette', 0.055, 0.02, (sx * (SW / 2 - 0.09), PY - 0.04, SB + SH / 2), rot=(90, 0, 0),
            mat=flat('#FFFFFF', 0.5), segs=20, origin='center', cap_mat=flat('#DDEBF7', 0.5))
    # low back shelf with EMPTY baskets and paper bags
    shelf = flat('#9A6436', 0.8)
    box('st_shelf', (1.3, 0.13, 0.04), (0.0, PY + 0.07, 0.34), mat=shelf, bevel=0.01)
    for sx in (-1, 1):
        box('st_shelf_side', (0.04, 0.13, 0.34), (sx * 0.63, PY + 0.07, 0.0), mat=shelf, bevel=0.008)
    MA.basket('st_bask1', (-0.42, PY + 0.07, 0.38), r=0.06, h=0.07)
    MA.basket('st_bask2', (0.44, PY + 0.07, 0.38), r=0.055, h=0.065)
    MA.paper_bags('st_bags', (0.02, PY + 0.07, 0.38), n=3)
    PA.lantern('st_lan', (-0.74, PY - 0.17, 1.42), 0.12, 3.0)
    box('st_lan_arm', (0.035, 0.2, 0.035), (-0.74, PY - 0.08, 1.62), mat=dark, bevel=0.01)
    LA.snow_drift('st_d1', 0.18, (0.92, 0.75, 0.0), seed=53)
    # ---------------------------------------------------------------- front layer (counter + EMPTY sloped case)
    with L.Collect() as front:
        CY, CD, CW = -0.14, 0.4, 1.44
        body = L.stripes('#C98F55', '#B27843', 6.0, 'X', soft=0.03)
        box('st_counter', (CW, CD, ST_COUNTER - 0.06), (0.0, CY, 0.0), mat=body, bevel=0.025)
        n = 6
        for i in range(n):
            x = -CW / 2 + (i + 0.5) * CW / n
            box('st_cplank', (CW / n - 0.02, 0.045, ST_COUNTER - 0.15), (x, CY - CD / 2 - 0.005, 0.03),
                mat=flat(['wood_light', 'plank', 'wood_mid'][i % 3], 0.8), bevel=0.012)
        box('st_ckick', (CW + 0.03, 0.06, 0.09), (0.0, CY - CD / 2 - 0.025, 0.0), mat=trim, bevel=0.015)
        box('st_ctop', (CW + 0.1, CD + 0.1, 0.06), (0.0, CY - 0.01, ST_COUNTER - 0.06), mat=tonal('#E2B47A', 0.08, 2.0),
            bevel=0.025)
        for sx in (-1, 1):
            box('st_cleg', (0.1, 0.1, ST_COUNTER - 0.06), (sx * (CW / 2 - 0.02), CY - CD / 2 + 0.03, 0.0), mat=trim,
                bevel=0.015)
        # the sloped bread case (linen-lined, EMPTY): x -0.66 .. 0.40, front lip y -0.33 low, back y -0.02 high
        cx0, cx1 = -0.66, 0.40
        ang = math.degrees(math.atan2((ST_CASE_TOP - 0.03) - (ST_COUNTER + 0.035), 0.31))
        mid_z = (_case_z(-0.33) + _case_z(-0.02)) / 2
        box('st_case_floor', (cx1 - cx0, 0.34, 0.03), ((cx0 + cx1) / 2, -0.175, mid_z - 0.03), rot=(ang, 0, 0),
            mat=wood('#9C6A3F', 0.06), bevel=0.008, origin='center')
        box('st_case_linen', (cx1 - cx0 - 0.06, 0.3, 0.012), ((cx0 + cx1) / 2, -0.175, mid_z - 0.01), rot=(ang, 0, 0),
            mat=L.stripes('#F4F1EA', '#D9584A', 9.0, 'X', rough=0.95, soft=0.08), bevel=0.004, origin='center')
        box('st_case_lip', (cx1 - cx0 + 0.02, 0.035, 0.07), ((cx0 + cx1) / 2, -0.345, ST_COUNTER), mat=trim, bevel=0.01)
        for sx in (cx0, cx1):
            box('st_case_side', (0.03, 0.34, 0.16), (sx, -0.175, ST_COUNTER), mat=trim, bevel=0.008)
        box('st_case_back', (cx1 - cx0 + 0.02, 0.03, 0.15), ((cx0 + cx1) / 2, -0.005, ST_COUNTER), mat=trim, bevel=0.008)
        # at the clerk's right end of the counter: a brass bell (no goods)
        brass = flat('#D9A93C', 0.3, 0.75)
        cyl('st_bell', 0.05, 0.05, (0.58, CY - 0.05, ST_COUNTER), mat=brass, segs=18, r_top=0.026, bevel=0.008)
        cyl('st_bell_knob', 0.012, 0.04, (0.58, CY - 0.05, ST_COUNTER + 0.05), mat=brass, segs=8)
        LA.snow_drift('st_d2', 0.14, (-0.88, -0.42, 0.0), seed=54)
    # ---------------------------------------------------------------- stock (hidden in the base frame)
    with L.Collect() as b1:
        # a few loaves left: 3 round loaves + a baguette, spread out (gaps of linen show between them)
        _loaf('b1_l1', (-0.48, -0.19, _case_z(-0.19)), 12, s=0.42, seed=1)
        _loaf('b1_l2', (-0.16, -0.2, _case_z(-0.2)), -18, s=0.41, seed=2)
        _loaf('b1_l3', (0.14, -0.16, _case_z(-0.16)), 25, s=0.4, seed=3)
        _baguette('b1_bg', (-0.32, -0.08, _case_z(-0.08) + 0.004), 4)
    with L.Collect() as b2:
        # a full case: two rows of loaves, a second layer, two baguettes and a basket of rolls
        pts = [(-0.5, -0.25, 15), (-0.2, -0.26, -20), (0.1, -0.25, 25),
               (-0.42, -0.08, -30), (-0.12, -0.07, 10), (0.18, -0.08, -25)]
        for k, (x, y, yaw) in enumerate(pts):
            _loaf('b2_l%d' % k, (x, y, _case_z(y)), yaw, s=0.42, seed=10 + k)
        _loaf('b2_top1', (-0.33, -0.17, _case_z(-0.17) + 0.09), 70, s=0.4, seed=20)
        _loaf('b2_top2', (-0.02, -0.16, _case_z(-0.16) + 0.09), 100, s=0.4, seed=21)
        _loaf('b2_top3', (-0.18, -0.13, _case_z(-0.13) + 0.17), 40, s=0.38, seed=22)
        _baguette('b2_bg1', (0.3, -0.17, _case_z(-0.17) + 0.07), 80, s=1.0)
        _baguette('b2_bg2', (0.36, -0.15, _case_z(-0.15) + 0.05), 70, s=0.95)
        # a basket of rolls at the right end of the counter (on the counter top, by the case)
        MA.basket('b2_rollbask', (0.52, -0.26, ST_COUNTER), r=0.085, h=0.08)
        rolls = [(0.5, -0.27), (0.55, -0.24), (0.52, -0.22), (0.545, -0.29), (0.49, -0.235)]
        for k, (x, y) in enumerate(rolls):
            PA.bread_model('b2_roll%d' % k, L_=0.14, W=0.12, H=0.08, loc=(x, y, ST_COUNTER + 0.065 + 0.014 * (k % 2)),
                           rot=(0, 0, 30 * k))
    sets = {'b0': [], 'b1': BA.descendants(b1.objs), 'b2': BA.descendants(b2.objs)}

    def setter(which):
        def f():
            BA.show(sets['b1'], which == 'b1')
            BA.show(sets['b2'], which == 'b2')
        return f
    setter('b0')()
    # ---------------------------------------------------------------- markers
    BA.mark('staff', (-0.02, 0.55, 0.0), facing=(0, -1, 0))
    BA.mark('step', (-0.02, 0.55, ST_STEP))
    BA.mark('customer', (-0.92, -0.70, 0.0), facing=(0, 1, 0))
    fy = PY - 0.032
    for (x, z) in ((-SW / 2 + 0.16, TOP - 0.075), (SW / 2 - 0.16, TOP - 0.075), (SW / 2 - 0.16, SB + 0.03),
                   (-SW / 2 + 0.16, SB + 0.03)):
        BA.mark('sign', (x, fy, z))
    L.point_light('st_lamp', (-0.6, PY - 0.3, 1.4), 'glow', 4.0, 0.2)
    # a soft warm light over the bread case (the loaves read golden at phone size; the counter warms a little)
    L.point_light('st_case_lamp', (-0.15, -0.75, 1.35), 'glow', 7.0, 0.5)
    return {'front': front.objs, 'stock': {'bakery43_bread_1': b1.objs, 'bakery43_bread_2': b2.objs},
            'frames': [('bakery43_stall_back', setter('b0')), ('bakery43_stall_b1', setter('b1')),
                       ('bakery43_stall_b2', setter('b2'))],
            'sprites': {'bakery43_stall_back': {'frame': 'bakery43_stall_back'}},
            'fx': {'case': (-0.13, -0.17, ST_CASE_TOP - 0.02), 'sign': (0.0, PY - 0.04, SB + SH / 2)}}


# =========================================================================== 농막 (the field's farm hut)

NOTE_HUT = ('농막 (v4.3 field, spec §3.2 / §6.1): a small log shed, 2.0 x 1.6 m, mossy snowy roof (top <= 2.6 m), door '
            'facing -Y (toward the wheat pile), a small lit window, an iron stovepipe on the -X gable (fxPoints.smoke = '
            'its top: the game puffs smoke there), a hoe / rake / sickle hanging on a rack on the +X wall, a lantern by '
            'the door. Decor (collider r ~62 px).')


@item('farm43_hut', fp=(2.0, 1.6), samples=56, catcher=12.0, notes=NOTE_HUT)
def b_hut():
    W, D = 1.62, 1.22
    top, eave = PA.log_house(W, D, 1.28, 2.28, over=0.26, r=0.12, seed=61, door_x=-0.32, windows=(),
                             roof_col=('#5E7F6A', '#527361'), chimney_x=None)
    r = 0.12
    BA.window('hut_win', (0.5, -D / 2 - r - 0.03, 1.2), 'y-', w=0.32, h=0.3, glow=2.0, shutters=None, seed=62)
    # stovepipe out of the -X gable
    iron = flat('#3E4048', 0.45, 0.5)
    gx = -(W + 0.6) / 2 - 0.09         # outside the roof's gable overhang
    cyl('pipe_h', 0.045, gx * -1 - W / 2 + 0.04, ((gx - W / 2) / 2, 0.05, 1.3), rot=(0, 90, 0), mat=iron, segs=14,
        origin='center')
    cyl('pipe_v', 0.045, 1.25, (gx, 0.05, 1.26), mat=iron, segs=14, bevel=0.01)
    cyl('pipe_cap', 0.09, 0.06, (gx, 0.05, 2.55), mat=iron, segs=14, r_top=0.03, bevel=0.0)
    cyl('pipe_cap_post', 0.014, 0.05, (gx, 0.05, 2.51), mat=iron, segs=8)
    PA.snow_cap('pipe_sn', 0.06, (gx, 0.05, 2.6), h=0.025, seed=63)
    # tool rack on the +X wall: a rail with pegs, a hoe, a rake, a sickle
    rx = W / 2 + r + 0.07
    box('rack_rail', (0.05, 0.9, 0.06), (rx, -0.02, 1.18), mat=flat('#6E4428', 0.8), bevel=0.01)
    handle = flat('#C98F55', 0.7)
    steel = flat('#9AA6B6', 0.35, 0.5)
    # hoe: handle + flat blade at the top (hung by its blade)
    cyl('hoe_h', 0.02, 1.15, (rx + 0.03, -0.32, 0.12), mat=handle, segs=8)
    box('hoe_b', (0.03, 0.16, 0.12), (rx + 0.06, -0.32, 1.2), mat=steel, bevel=0.008)
    # rake: handle + toothed head
    cyl('rake_h', 0.02, 1.15, (rx + 0.03, 0.05, 0.12), mat=handle, segs=8)
    box('rake_head', (0.04, 0.3, 0.04), (rx + 0.04, 0.05, 1.27), mat=flat('#8A5A36', 0.8), bevel=0.008)
    for k in range(6):
        cyl('rake_t', 0.008, 0.08, (rx + 0.06, -0.08 + k * 0.052, 1.2), mat=steel, segs=6)
    BA.sickle_model('sickle', s=0.55, loc=(rx + 0.04, 0.36, 1.02), rot=(90, 0, 90))
    # lantern by the door, a chopping stump, snow drifts
    box('hut_lan_arm', (0.04, 0.18, 0.04), (0.28, -D / 2 - r - 0.08, 1.52), mat=flat('#5E3E26', 0.8), bevel=0.01)
    PA.lantern('hut_lan', (0.28, -D / 2 - r - 0.17, 1.26), 0.11, 3.0)
    LA.snow_drift('hut_d1', 0.2, (-W / 2 - 0.2, D / 2 + 0.05, 0.0), seed=64)
    LA.snow_drift('hut_d2', 0.16, (W / 2 + 0.25, -D / 2 - 0.15, 0.0), seed=65, scale=(1.2, 1.0, 0.3))
    BA.mark('door', (-0.32, -D / 2 - 0.45, 0.0), facing=(0, -1, 0))
    return {'frames': [('farm43_hut', None)], 'sprites': {'farm43_hut': {'frame': 'farm43_hut'}},
            'fx': {'smoke': (gx, 0.05, 2.66), 'lantern': (0.28, -D / 2 - r - 0.17, 1.35)}}


# =========================================================================== scarecrow with a scarf

NOTE_SCARE = ('허수아비 (v4.3 field): ~1.9 m on a post, burlap head with a stitched smile, straw hat with snow on the '
              'brim, patched blue coat with straw tufts, a long red-white knitted scarf blowing to the side. Faces the '
              'camera. Decor (collider r 14 px).')


@item('farm43_scarecrow', fp=('r', 0.3), samples=56, catcher=6.0, notes=NOTE_SCARE, yaw=45.0, kind='prop')
def b_scarecrow():
    post = wood('#8A5A36', 0.08)
    cyl('sc_post', 0.045, 1.55, (0, 0, 0), mat=post, segs=12, bevel=0.01)
    box('sc_bar', (1.0, 0.07, 0.07), (0, 0.0, 1.22), mat=post, bevel=0.012)
    LA.snow_drift('sc_base', 0.18, (0.05, 0.0, 0.0), seed=70, scale=(1.3, 1.1, 0.4))
    # coat: torso + sleeves along the bar, a patch, buttons
    coat = flat('#4F74A6', 0.85)
    box('sc_torso', (0.44, 0.24, 0.56), (0, 0.0, 0.78), mat=coat, bevel=0.06, taper=(0.86, 0.9))
    for sx in (-1, 1):
        cyl('sc_sleeve', 0.075, 0.38, (sx * 0.35, 0.0, 1.255), rot=(0, 90, 0), mat=coat, segs=14, origin='center',
            r_top=0.085)
        straw = flat('#E2B85A', 0.9)
        for k in range(5):
            a = math.radians(-50 + k * 25)
            L.tube('sc_tuft', [(sx * 0.53, 0.0, 1.255), (sx * (0.53 + 0.1 * math.cos(a)), 0.02 * k - 0.04,
                                                       1.255 + 0.1 * math.sin(a))], 0.012, straw)
    box('sc_patch', (0.13, 0.02, 0.12), (0.08, -0.125, 0.95), mat=flat('#D9A93C', 0.85), bevel=0.01)
    for k in range(3):
        sphere('sc_btn', 0.022, (-0.06, -0.125, 0.9 + k * 0.12), flat('#F2EDE2', 0.5), segs=10, rings=6)
    straw = flat('#E2B85A', 0.9)
    for k in range(7):
        x = -0.17 + k * 0.057
        L.tube('sc_hem', [(x, -0.05, 0.8), (x * 1.15, -0.07, 0.68 - 0.02 * (k % 2))], 0.011, straw)
    # head: burlap ball, button eyes, stitched smile, rosy cheeks
    burlap = tonal('#D8C39A', 0.1, 18.0, rough=0.95)
    sphere('sc_head', 0.17, (0, 0.0, 1.55), burlap, scale=(1.0, 0.95, 1.0), segs=24, rings=14)
    eye = flat('#2A2026', 0.4)
    for sx in (-1, 1):
        sphere('sc_eye', 0.026, (sx * 0.06, -0.155, 1.58), eye, segs=12, rings=8)
        sphere('sc_cheek', 0.03, (sx * 0.1, -0.135, 1.52), flat('#F48A8A', 0.7), scale=(1.0, 0.4, 0.7), segs=10,
               rings=6)
    pts = [(math.sin(math.radians(a)) * 0.08, -0.16 + 0.03 * (1 - math.cos(math.radians(a))),
            1.505 - 0.025 * math.cos(math.radians(a))) for a in range(-60, 61, 20)]
    L.smooth_tube('sc_smile', pts, 0.008, flat('#5A3A26', 0.8))
    cyl('sc_neck', 0.07, 0.08, (0, 0.0, 1.37), mat=flat('#8A5A33', 0.8), segs=12)
    # straw hat with snow on the brim and crown, red band
    hat = tonal('#E8C46A', 0.12, 10.0, rough=0.9)
    cyl('sc_brim', 0.27, 0.025, (0, 0.0, 1.66), mat=hat, segs=28, bevel=0.01)
    cyl('sc_crown', 0.14, 0.15, (0, 0.0, 1.68), mat=hat, segs=24, r_top=0.12, bevel=0.03)
    cyl('sc_band', 0.142, 0.035, (0, 0.0, 1.69), mat=flat('#C8402F', 0.7), segs=24)
    PA.snow_cap('sc_hat_sn', 0.11, (0, 0.0, 1.83), h=0.04, seed=71)
    PA.snow_cap('sc_brim_sn', 0.12, (-0.12, 0.1, 1.685), h=0.025, seed=72, scale=(1.4, 1.0, 1.0))
    PA.snow_cap('sc_bar_sn', 0.06, (0.44, 0.0, 1.335), h=0.025, seed=73)
    # the scarf: a knitted ring round the neck and a long striped tail blowing out to the camera's right (+X side)
    red, white = flat('#D9382F', 0.85), flat('#F4F1EA', 0.85)
    for k in range(14):
        a = math.tau * k / 14
        box('sc_scarf_r', (0.06, 0.07, 0.07), (0.15 * math.cos(a), 0.14 * math.sin(a), 1.4), rot=(0, 0, math.degrees(a)),
            mat=red if (k // 2) % 2 == 0 else white, bevel=0.02, origin='center')
    prev = Vector((0.1, -0.12, 1.4))
    for k in range(10):
        t = (k + 1) / 10
        p = Vector((0.1 + 0.62 * t, -0.12 - 0.05 * t + 0.04 * math.sin(t * 6.0), 1.4 - 0.12 * t + 0.07 * math.sin(t * 5.0)))
        d = p - prev
        ln = d.length
        yaw = math.degrees(math.atan2(d.y, d.x))
        pitch = -math.degrees(math.atan2(d.z, math.hypot(d.x, d.y)))
        box('sc_scarf_t', (ln + 0.012, 0.12, 0.025), tuple((p + prev) / 2), rot=(18 * math.sin(t * 4.0), pitch, yaw),
            mat=red if k % 2 == 0 else white, bevel=0.008, origin='center')
        prev = p
    for k in range(4):
        L.tube('sc_fringe', [tuple(prev + Vector((0, -0.045 + k * 0.03, 0))),
                             tuple(prev + Vector((0.06, -0.045 + k * 0.03, -0.02)))], 0.007, white)
    return {'frames': [('farm43_scarecrow', None)], 'sprites': {'farm43_scarecrow': {'frame': 'farm43_scarecrow'}}}


# =========================================================================== sled cart of sheaves

NOTE_SLED = ('썰매 수레 (v4.3 field): a wooden sled (runners curling up at +X) with four tied wheat sheaves under a dusting '
             'of snow, roped down, and a rope pull. Decor (collider r 34 px).')


@item('farm43_sledcart', fp=(1.5, 0.8), samples=56, catcher=8.0, notes=NOTE_SLED)
def b_sled():
    iron = flat('#5C4430', 0.7)
    for sy in (-1, 1):
        y = sy * 0.32
        L.smooth_tube('sl_runner', [(-0.72, y, 0.05), (0.42, y, 0.05), (0.62, y, 0.08), (0.76, y, 0.24), (0.7, y, 0.38)],
                      0.035, iron)
        for x in (-0.5, 0.0, 0.42):
            box('sl_strut', (0.06, 0.06, 0.18), (x, y, 0.05), mat=flat('wood_dark', 0.8), bevel=0.015)
    deck = L.stripes('#C98F55', '#B27843', 7.0, 'X', rough=0.8, soft=0.03)
    box('sl_deck', (1.3, 0.78, 0.07), (-0.08, 0.0, 0.22), mat=deck, bevel=0.02)
    for sy in (-1, 1):
        box('sl_rail', (1.3, 0.05, 0.12), (-0.08, sy * 0.38, 0.29), mat=flat('wood_dark', 0.8), bevel=0.015)
    box('sl_back', (0.05, 0.8, 0.22), (-0.72, 0.0, 0.29), mat=flat('wood_dark', 0.8), bevel=0.015)
    # four sheaves lying across the sled (ears toward -Y, the camera side), a rope over them
    for k, x in enumerate((-0.5, -0.22, 0.06, 0.34)):
        sheaf('sl_sh%d' % k, (x, 0.3, 0.38), length=0.66, r=0.085, yaw=-90 + (k % 2) * 6 - 3, seed=80 + k, snow=1.0)
    rope = flat('rope', 0.8)
    L.smooth_tube('sl_rope', [(-0.72, -0.3, 0.42), (-0.2, -0.3, 0.52), (0.4, -0.3, 0.5), (0.5, -0.3, 0.35)], 0.014,
                  rope)
    L.smooth_tube('sl_pull', [(0.7, 0.0, 0.36), (0.88, 0.05, 0.22), (1.0, -0.08, 0.05), (1.12, -0.2, 0.02)], 0.016,
                  rope)
    L.snow_slab('sl_snow', 0.42, 0.22, 0.025, (-0.25, 0.08, 0.46), seed=84, droop=0.02)
    LA.snow_drift('sl_d', 0.16, (-0.8, 0.35, 0.0), seed=85)
    return {'frames': [('farm43_sledcart', None)], 'sprites': {'farm43_sledcart': {'frame': 'farm43_sledcart'}}}


# =========================================================================== the wheat pile's sacks

NOTE_SACKS = ('밀 더미 소품 (v4.3 field): two burlap grain sacks (one leaning) and a small stack of sheaves; the wheat '
              'pile\'s prop instead of the hay bale. The pile\'s items are drawn by the game beside it.')


@item('farm43_sacks', fp=(1.0, 0.6), samples=56, catcher=6.0, notes=NOTE_SACKS, kind='prop')
def b_sacks():
    BA.sack('sk_1', (-0.22, 0.05, 0.0), s=1.15, col='#D8C39A', seed=90, tie='#8A5A33')
    BA.sack('sk_2', (0.1, 0.16, 0.0), s=0.95, col='#CDB68A', seed=91, tie='#8A5A33')
    PA.snow_cap('sk_sn1', 0.12, (-0.24, 0.05, 0.53), h=0.04, seed=92)
    for k, (x, z, yaw) in enumerate(((0.3, 0.09, -70), (0.36, 0.09, -100), (0.33, 0.25, -85))):
        sheaf('sk_sh%d' % k, (x, -0.05, z), length=0.5, r=0.07, yaw=yaw, seed=93 + k, snow=1.0 if k == 2 else 0.0)
    LA.snow_drift('sk_d', 0.12, (-0.45, -0.12, 0.0), seed=96)
    return {'frames': [('farm43_sacks', None)], 'sprites': {'farm43_sacks': {'frame': 'farm43_sacks'}}}
