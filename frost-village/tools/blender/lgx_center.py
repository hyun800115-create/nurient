"""
lgx_center.py - the logistics centre "솔방울 물류센터" (docs/CONTRACT_V8.md section AA) built ONCE as a tagged scene;
lgx_render.render_center() renders it as aligned cutaway layers (one frame + one anchor for every layer).

Footprint 11 x 8 m (X x Y), walls 0.24 m, eave 4.0 m, barrel-vault roof (+1.7 m) along X.
Camera sees the -Y face (front, screen down-left: customer entrance) and the +X face (screen down-right: two truck
docks).  The back walls are -X (screen up-left) and +Y (screen up-right): they stay standing in the cutaway.

Groups (custom property 'lgx' on every object):
  back      back walls -X / +Y seen from inside (lining, windows, clock, notice board, lamps ...)
  floor     floor slab inside + markings + dock levellers
  apron     outside ground pieces (dock apron, entrance landing, receiving pad)  -> part of the _floor layer
  interior  racks, conveyor body, packing table, office, counter, decor (static)
  rackf     the rack FRONT parts (front uprights, front beams, beam tags) = part of _interior, repeated in the
            _interior_racks overlay so the game's stock stacks sit INSIDE the racks
  front_f   the 'front furniture' subset of interior (counter, conveyor, packing table): staff stand BEHIND it,
            so it is repeated in the _interior_front overlay (= _interior pixels x this mask)
  belt      conveyor belt + riding boxes (8-frame loop patch, never in _interior)
  lamp      office desk lamp head (4-frame glow patch)
  stub      front walls cut at 0.45 m (always drawn above everything inside)
  cut       front walls cut at 1.6 m (the 'half' reveal state)
  shell     front walls (full) + roof + gables + signs + canopies (the part that fades)
  door1/2   dock roll-up door leaves (6-frame open/close patches over the shell)
  props     outside props (bumpers, bollards, dock lamps, bench, snow) - drawn above the shell, never fade

Not run directly - see lgx_render.py.
"""
import math

import bpy  # noqa: F401
from mathutils import Vector

import bl_common as bc
import prop_lib as L
from prop_lib import C, flat, snowy, tonal, box, cyl, sphere, blob, extrude, hexmix
import prop_assets as PA
import bld_assets as BA
import town_lib as T
import life2_lib as L2
import lgx_lib as X
from lgx_lib import Group

# ------------------------------------------------------------------------------------------------- dimensions
W, D, TW = 11.0, 8.0, 0.24
X0, Y0 = W / 2, D / 2
XI, YI = X0 - TW, Y0 - TW
EAVE, RISE, OVER = 4.0, 1.7, 0.3
STUB_Z, CUT_Z = 0.45, 1.6
ENTR = (-2.15, -1.05, 2.3)              # entrance on the -Y wall: x0, x1, height
DOCK1 = (-3.3, -0.9, 2.8)               # dock 1 on the +X wall (van): y0, y1, height
DOCK2 = (0.5, 2.8, 2.8)                 # dock 2 on the +X wall (truck)
WIN_Y = [(-4.15, 1.75, 2.55, 0.9), (0.2, 2.6, 3.35, 0.8), (1.75, 2.6, 3.35, 0.8), (3.3, 2.6, 3.35, 0.8)]
OFFICE_WIN = WIN_Y[0]

# palette of the building
WALL = '#8DB9DF'          # sky-blue corrugated cladding
WALL_D = '#79A6CF'
TRIM = '#F4F1EA'
BRICK = ('#B4593F', '#9E4B35', '#DCCFC0')
ROOF = '#4F6787'
DOOR_YEL = '#F2C230'
SIGN_YEL = '#F2C230'
LINING_UP = '#F3EAD8'
LINING_LO = '#86AECF'

CAT_COL = {'materials': '#7BB661', 'food': '#F08A3C', 'goods': '#4F95D9', 'furniture': '#B07AD8',
           'tools': '#D9483B', 'appliances': '#3FB8A6'}

# racks: (key, category, x0, x1) along the +Y wall, front y = RACK_YF, depth RACK_D
RACK_YF, RACK_D = 2.78, 0.9
RACK_LEVELS = [0.12, 1.32, 2.52]
RACK_TOP = 3.3
BACK_RACKS = [('rack_food', 'food', -4.0, -1.85), ('rack_goods', 'goods', -1.7, 0.45),
              ('rack_tools', 'tools', 0.6, 2.75), ('rack_appliances', 'appliances', 2.9, 5.05)]
# furniture rack along the -X wall: front x = FRACK_XF (faces +X), y range
FRACK_XF, FRACK_D, FRACK_Y = -4.2, 1.0, (0.0, 2.35)
FRACK_LEVELS = [0.12, 1.45]
FRACK_TOP = 2.65
# floor bays (materials staging, front right)
BAYS = [(0.95, 2.3, -3.55, -2.45), (2.4, 3.75, -3.55, -2.45), (0.95, 2.3, -2.35, -1.25), (2.4, 3.75, -2.35, -1.25)]
CONV = (-2.6, 2.3, -0.5, 0.1, 0.85)     # conveyor x0, x1, y0, y1, belt height
PACK = (2.45, 3.75, -0.65, 0.25, 0.86)  # packing table x0, x1, y0, y1, top
COUNTER = (-5.22, -3.2, -2.45, -1.95, 1.05)
LANE_Y = 1.65
CORR_X = 4.45
BELT_SPACING = 1.6                      # box spacing on the belt (one spacing per 8-frame loop)
BELT_FRAMES = 8
CLEAT_P = BELT_SPACING / 3.0

POINTS = {}           # filled by build(): name -> dict / list (world metres)


def wpt(x, y, z=0.0):
    return (round(x, 4), round(y, 4), round(z, 4))


# =================================================================================================== walls

def run_x(name, y0, y1, x0, x1, z0, z1, mat, holes=(), top_mat=None, bevel=0.02):
    """Wall run along X (y in [y0, y1]) from x0 to x1, z0..z1, with rectangular holes [(hx0, hx1, hz0, hz1)]."""
    objs = []
    hs = sorted([h for h in holes if h[1] > x0 and h[0] < x1 and h[2] < z1 and h[3] > z0])
    xs = x0
    yc, dy = (y0 + y1) / 2, y1 - y0
    for hx0, hx1, hz0, hz1 in hs:
        if hx0 > xs + 1e-3:
            objs.append(box(name, (hx0 - xs, dy, z1 - z0), ((xs + hx0) / 2, yc, z0), mat=mat, bevel=bevel,
                            top_mat=top_mat))
        if hz0 > z0 + 1e-3:
            objs.append(box(name + '_sill', (hx1 - hx0, dy, min(hz0, z1) - z0), ((hx0 + hx1) / 2, yc, z0), mat=mat,
                            bevel=bevel, top_mat=top_mat))
        if hz1 < z1 - 1e-3:
            objs.append(box(name + '_lint', (hx1 - hx0, dy, z1 - max(hz1, z0)), ((hx0 + hx1) / 2, yc, max(hz1, z0)),
                            mat=mat, bevel=bevel, top_mat=top_mat))
        xs = hx1
    if x1 > xs + 1e-3:
        objs.append(box(name, (x1 - xs, dy, z1 - z0), ((xs + x1) / 2, yc, z0), mat=mat, bevel=bevel, top_mat=top_mat))
    return objs


def run_y(name, x0, x1, y0, y1, z0, z1, mat, holes=(), top_mat=None, bevel=0.02):
    """Wall run along Y (x in [x0, x1]) from y0 to y1 with holes [(hy0, hy1, hz0, hz1)]."""
    objs = []
    hs = sorted([h for h in holes if h[1] > y0 and h[0] < y1 and h[2] < z1 and h[3] > z0])
    ys = y0
    xc, dx = (x0 + x1) / 2, x1 - x0
    for hy0, hy1, hz0, hz1 in hs:
        if hy0 > ys + 1e-3:
            objs.append(box(name, (dx, hy0 - ys, z1 - z0), (xc, (ys + hy0) / 2, z0), mat=mat, bevel=bevel,
                            top_mat=top_mat))
        if hz0 > z0 + 1e-3:
            objs.append(box(name + '_sill', (dx, hy1 - hy0, min(hz0, z1) - z0), (xc, (hy0 + hy1) / 2, z0), mat=mat,
                            bevel=bevel, top_mat=top_mat))
        if hz1 < z1 - 1e-3:
            objs.append(box(name + '_lint', (dx, hy1 - hy0, z1 - max(hz1, z0)), (xc, (hy0 + hy1) / 2, max(hz1, z0)),
                            mat=mat, bevel=bevel, top_mat=top_mat))
        ys = hy1
    if y1 > ys + 1e-3:
        objs.append(box(name, (dx, y1 - ys, z1 - z0), (xc, (ys + y1) / 2, z0), mat=mat, bevel=bevel, top_mat=top_mat))
    return objs


def front_holes():
    hy = [(ENTR[0], ENTR[1], 0.0, ENTR[2])] + [(x - w / 2, x + w / 2, z0, z1) for x, z0, z1, w in WIN_Y]
    hx = [(DOCK1[0], DOCK1[1], 0.0, DOCK1[2]), (DOCK2[0], DOCK2[1], 0.0, DOCK2[2])]
    return hy, hx


def front_walls(z_top, cap=None, name='fw'):
    """Front walls (-Y and +X) from 0 to z_top: brick plinth to 0.8 m, corrugated cladding above, corner posts.
    cap -> the top face uses the cutaway section material (stub / cut versions)."""
    hy, hx = front_holes()
    brick = L.brick(*BRICK, scale=2.6, row_h=0.3, brick_w=0.55, snow_top=False)
    cy = X.corrugated(WALL, 9.0, 'X', 0.14)
    cx = X.corrugated(WALL, 9.0, 'Y', 0.14)
    objs = []
    zb = min(0.8, z_top)
    capm = cap
    # plinth slightly proud (outside +0.03)
    objs += run_x(name + '_by', -Y0 - 0.03, -Y0 + TW, -X0 - 0.03, X0 + 0.03, 0.0, zb, brick, holes=hy,
                  top_mat=capm if z_top <= 0.8 else None)
    objs += run_y(name + '_bx', X0 - TW, X0 + 0.03, -Y0 - 0.03, Y0, 0.0, zb, brick, holes=hx,
                  top_mat=capm if z_top <= 0.8 else None)
    if z_top > 0.8:
        objs += run_x(name + '_cy', -Y0, -Y0 + TW, -X0, X0, 0.8, z_top, cy, holes=hy, top_mat=capm)
        objs += run_y(name + '_cx', X0 - TW, X0, -Y0 + TW, Y0, 0.8, z_top, cx, holes=hx, top_mat=capm)
        # brick coping line over the plinth
        objs += run_x(name + '_copy', -Y0 - 0.05, -Y0 + 0.02, -X0 - 0.05, X0 + 0.05, 0.78, 0.86,
                      flat('#E9E1D3', 0.7), holes=hy)
        objs += run_y(name + '_copx', X0 - 0.02, X0 + 0.05, -Y0 - 0.05, Y0, 0.78, 0.86, flat('#E9E1D3', 0.7),
                      holes=hx)
    # white corner / bay posts
    tm = flat(TRIM, 0.6)
    posts_y = [-X0, -2.95, ENTR[0] - 0.12, ENTR[1] + 0.12, 2.55, X0]
    for k, x in enumerate(posts_y):
        if x in (-X0, X0) or z_top <= 0.85:
            continue
        objs.append(box(name + '_py', (0.2, 0.08, z_top - 0.8), (x, -Y0 - 0.03, 0.8), mat=tm, bevel=0.02,
                        top_mat=capm))
    for y in (DOCK1[0] - 0.14, DOCK1[1] + 0.14, DOCK2[0] - 0.14, DOCK2[1] + 0.14):
        if z_top <= 0.85:
            continue
        objs.append(box(name + '_px', (0.08, 0.2, z_top - 0.8), (X0 + 0.03, y, 0.8), mat=tm, bevel=0.02,
                        top_mat=capm))
    objs.append(box(name + '_corner', (0.3, 0.3, z_top), (X0 - 0.1, -Y0 + 0.1, 0.0), mat=tm, bevel=0.03,
                    top_mat=capm))
    return objs


def cut_cap(name, z, objs_hint=None):
    """Thin dark line under the cream section caps so the cut reads at phone zoom (both front runs)."""
    hy, hx = front_holes()
    em = flat(X.CUT_EDGE, 0.7)
    out = []
    out += run_x(name + '_ey', -Y0 - 0.035, -Y0 + TW + 0.005, -X0 - 0.035, X0 + 0.035, z - 0.035, z - 0.012, em,
                 holes=hy, bevel=0.0)
    out += run_y(name + '_ex', X0 - TW - 0.005, X0 + 0.035, -Y0 - 0.035, Y0, z - 0.035, z - 0.012, em, holes=hx,
                 bevel=0.0)
    return out


# =================================================================================================== back walls

def back_walls():
    """-X wall and +Y wall: outer cladding + inner lining (blue dado, cream above) + wall plate + clerestory windows
    + all the wall-mounted details seen in the cutaway."""
    brick = L.brick(*BRICK, scale=2.6, row_h=0.3, brick_w=0.55, snow_top=False)
    lo = tonal(LINING_LO, 0.05, 4.0, rough=0.8)
    up = tonal(LINING_UP, 0.04, 3.0, rough=0.85)
    plate = tonal('#B9783F', 0.08, 5.0, rough=0.7)
    capm = flat(X.CUT, 0.75)
    winm = L.emissive('clere_glow', '#DDEEFF', '#E8F4FF', 0.9)
    clere = [(-2.6, 3.0, 3.7, 1.4), (0.0, 3.0, 3.7, 1.4), (2.6, 3.0, 3.7, 1.4)]
    clere_x = [(-1.7, 3.0, 3.7, 1.4), (1.3, 3.0, 3.7, 1.4)]
    hy = [(x - w / 2, x + w / 2, z0, z1) for x, z0, z1, w in clere]
    hx = [(y - w / 2, y + w / 2, z0, z1) for y, z0, z1, w in clere_x]
    objs = []
    # +Y wall (runs along X)
    objs += run_x('bwY_out', YI + 0.08, Y0, -X0, X0, 0.0, EAVE, X.corrugated(WALL, 9.0, 'X', 0.14), holes=hy,
                  top_mat=capm)
    objs += run_x('bwY_lo', YI, YI + 0.08, -XI, XI, 0.0, 1.1, lo, top_mat=lo)
    objs += run_x('bwY_up', YI, YI + 0.08, -XI, XI, 1.1, EAVE, up, holes=hy, top_mat=capm)
    objs.append(box('bwY_plate', (2 * X0, TW + 0.06, 0.14), (0, Y0 - TW / 2 + 0.03, EAVE - 0.02), mat=plate,
                    bevel=0.02))
    objs += run_x('bwY_brick', Y0 - 0.02, Y0 + 0.03, -X0 - 0.03, X0 + 0.03, 0.0, 0.8, brick)
    # -X wall (runs along Y)
    objs += run_y('bwX_out', -X0, -XI - 0.08, -Y0, Y0, 0.0, EAVE, X.corrugated(WALL, 9.0, 'Y', 0.14), holes=hx,
                  top_mat=capm)
    objs += run_y('bwX_lo', -XI - 0.08, -XI, -YI, YI, 0.0, 1.1, lo, top_mat=lo)
    objs += run_y('bwX_up', -XI - 0.08, -XI, -YI, YI, 1.1, EAVE, up, holes=hx, top_mat=capm)
    objs.append(box('bwX_plate', (TW + 0.06, 2 * Y0, 0.14), (-X0 + TW / 2 - 0.03, 0, EAVE - 0.02), mat=plate,
                    bevel=0.02))
    objs += run_y('bwX_brick', -X0 - 0.03, -X0 + 0.02, -Y0 - 0.03, Y0 + 0.03, 0.0, 0.8, brick)
    # clerestory windows: glowing panes inside the holes + white frames + mullions (inside faces)
    fm = flat(TRIM, 0.6)
    for k, (x, z0, z1, w) in enumerate(clere):
        objs.append(box('clY%d' % k, (w, 0.06, z1 - z0), (x, YI + 0.12, z0), mat=winm, bevel=0.0))
        objs.append(box('clYf%d' % k, (w + 0.14, 0.05, 0.08), (x, YI - 0.02, z0 - 0.06), mat=fm, bevel=0.015))
        objs.append(box('clYt%d' % k, (w + 0.14, 0.05, 0.08), (x, YI - 0.02, z1 - 0.02), mat=fm, bevel=0.015))
        for j in range(1, 3):
            objs.append(box('clYm%d' % k, (0.05, 0.05, z1 - z0), (x - w / 2 + w * j / 3, YI + 0.04, z0), mat=fm,
                            bevel=0.0))
    for k, (y, z0, z1, w) in enumerate(clere_x):
        objs.append(box('clX%d' % k, (0.06, w, z1 - z0), (-XI - 0.12, y, z0), mat=winm, bevel=0.0))
        objs.append(box('clXf%d' % k, (0.05, w + 0.14, 0.08), (-XI + 0.02, y, z0 - 0.06), mat=fm, bevel=0.015))
        objs.append(box('clXt%d' % k, (0.05, w + 0.14, 0.08), (-XI + 0.02, y, z1 - 0.02), mat=fm, bevel=0.015))
        for j in range(1, 3):
            objs.append(box('clXm%d' % k, (0.05, 0.05, z1 - z0), (-XI - 0.04, y - w / 2 + w * j / 3, z0), mat=fm,
                            bevel=0.0))
    # hazard band along the bottom of the +Y wall and a dado rail
    objs += run_x('bwY_rail', YI - 0.04, YI, -XI, XI, 1.08, 1.14, flat(TRIM, 0.6), bevel=0.01)
    objs += run_y('bwX_rail', -XI, -XI + 0.04, -YI, YI, 1.08, 1.14, flat(TRIM, 0.6), bevel=0.01)
    hz = X.hazard(X.LINE_YEL, X.INK, 5.0, 45.0, ('X', 'Z'))
    objs += run_x('bwY_haz', YI - 0.03, YI, -XI, XI, 0.0, 0.16, hz, bevel=0.0)
    hz2 = X.hazard(X.LINE_YEL, X.INK, 5.0, 45.0, ('Y', 'Z'))
    objs += run_y('bwX_haz', -XI, -XI + 0.03, -YI, YI, 0.0, 0.16, hz2, bevel=0.0)
    # details on the +Y wall (face 'y+' = wall plane, outward -y into the room)
    objs.append(X.wall_clock('clock', (-0.9, YI - 0.0, 3.35), face='y-', r=0.3))
    for k, x in enumerate((-3.9, -1.3, 1.3, 3.9)):
        objs.append(X.wall_lamp('wlY%d' % k, (x, YI, 3.75), face='y-'))
    objs.append(X.extinguisher('extY', (5.15, YI, 0.55), face='y-'))
    objs.append(X.safety_sign('aidY', (5.12, YI, 1.75), face='y-', col='#3FA55B', icon='plus'))
    # details on the -X wall (face 'x-' plane = wall at x = -XI, outward +x)
    objs.append(X.pin_board('board', (-XI, -1.15, 1.45), face='x+', w=1.15, h=0.8, seed=4))
    objs.append(X.wall_clock('clockX', (-XI, -2.85, 2.55), face='x+', r=0.24, rim='#D9483B'))
    for k, y in enumerate((-2.0, 1.2, 3.1)):
        objs.append(X.wall_lamp('wlX%d' % k, (-XI, y, 3.75), face='x+'))
    objs.append(X.extinguisher('extX', (-XI, 2.85, 0.55), face='x+'))
    objs.append(X.safety_sign('cauX', (-XI, 2.85, 1.85), face='x+', col='#F2C230', icon='tri'))
    # calendar under the clock
    cal = [box('cal', (0.32, 0.03, 0.42), (0, -0.02, 0), mat=flat('#FBF6EA', 0.7), bevel=0.01),
           box('cal_h', (0.32, 0.035, 0.1), (0, -0.025, 0.34), mat=flat('#D9483B', 0.5), bevel=0.01)]
    mb = L2.MB()
    for r in range(4):
        for c in range(5):
            mb.cube((0.035, 0.01, 0.03), flat('#8C94A0', 0.7), loc=(-0.12 + c * 0.06, -0.045, 0.07 + r * 0.065))
    cal.append(mb.done('cal_d'))
    objs.append(T.face_group(cal, 'x+', (-XI, -2.85, 1.65), 'calendar'))
    return objs


# =================================================================================================== floor

def floor_and_markings():
    objs = [box('slab', (2 * X0, 2 * Y0, 0.16), (0, 0, -0.16), mat=X.concrete(), bevel=0.02)]
    ym = flat(X.LINE_YEL, 0.6)
    wm = flat(X.LINE_WHITE, 0.65)
    z = 0.0
    # forklift lane edges + centre arrows
    objs.append(X.floor_line('laneA', (-3.9, 1.0), (CORR_X - 0.62, 1.0), 0.07, ym, z))
    objs.append(X.floor_line('laneB', (-3.9, 2.3), (XI - 0.05, 2.3), 0.07, ym, z))
    for k, x in enumerate((-2.6, -0.2, 2.2)):
        objs.append(X.arrow_decal('arw%d' % k, (x, LANE_Y), (1, 0), 0.62, wm, z))
    # dock corridor edge
    objs.append(X.floor_line('corr', (CORR_X - 0.62, -3.6), (CORR_X - 0.62, 1.0), 0.07, ym, z))
    objs.append(X.arrow_decal('arwc', (CORR_X, -0.6), (0, -1), 0.6, wm, z))
    # category colour stripes in front of the racks + furniture rack
    for key, cat, x0, x1 in BACK_RACKS:
        objs.append(X.decal_box('cs_' + cat, x0 + 0.05, x1 - 0.05, RACK_YF - 0.16, RACK_YF - 0.04,
                                flat(CAT_COL[cat], 0.6), z))
    objs.append(X.decal_box('cs_furn', FRACK_XF + 0.04, FRACK_XF + 0.16, FRACK_Y[0] + 0.05, FRACK_Y[1] - 0.05,
                            flat(CAT_COL['furniture'], 0.6), z))
    # staging bays (materials): white frames with green corner marks
    gm = flat(CAT_COL['materials'], 0.6)
    for k, (x0, x1, y0, y1) in enumerate(BAYS):
        for (p, q) in (((x0, y0), (x1, y0)), ((x1, y0), (x1, y1)), ((x1, y1), (x0, y1)), ((x0, y1), (x0, y0))):
            objs.append(X.floor_line('bay%d' % k, p, q, 0.05, wm, z))
        for cx, cy in ((x0, y0), (x1, y1)):
            objs.append(X.decal_box('bayc%d' % k, cx - 0.1, cx + 0.1, cy - 0.1, cy + 0.1, gm, z + 0.002, t=0.012))
    # materials bay emblem painted on the floor: green disc with two logs (end grain) - no occlusion issues
    cxm, cym = 0.42, -1.75
    objs.append(cyl('matdisc', 0.42, 0.012, (cxm, cym, z), mat=flat(CAT_COL['materials'], 0.6), segs=40,
                    bevel=0.0, scale=(1, 1, 1)))
    objs.append(cyl('matring', 0.46, 0.008, (cxm, cym, z), mat=flat('#F4F1EA', 0.6), segs=40, bevel=0.0))
    lm = flat('#8A5A33', 0.7)
    em = flat('#E9C690', 0.7)
    for k, (dx, dy) in enumerate(((-0.1, 0.12), (0.1, -0.12), (0.0, 0.0))):
        objs.append(box('matlog%d' % k, (0.44, 0.13, 0.014), (cxm + dx * 0.4 - 0.02, cym + dy, z + 0.002),
                        rot=(0, 0, 0), mat=lm, bevel=0.0))
        objs.append(cyl('matend%d' % k, 0.065, 0.016, (cxm + dx * 0.4 + 0.2, cym + dy, z + 0.002), mat=em, segs=16,
                        bevel=0.0))
    # customer zone (soft green walkway) + queue footprints
    objs.append(X.decal_box('walk', -5.15, -0.95, -3.68, -2.62, flat('#A9D8A3', 0.75), z, t=0.008))
    for (x, y) in [(-4.2, -3.0), (-3.35, -3.1), (-2.5, -3.2)]:
        for s in (-1, 1):
            objs.append(sphere('foot', 0.09, (x + s * 0.09, y, z + 0.004), flat('#FBF6EA', 0.7), scale=(0.6, 1.0,
                                                                                                       0.05),
                               segs=12, rings=4))
    # dock levellers inside the dock doors
    st = flat('#9AA4B1', 0.35, 0.6)
    for k, (y0, y1, _) in enumerate((DOCK1, DOCK2)):
        objs.append(box('lev%d' % k, (0.75, y1 - y0 - 0.1, 0.02), (XI - 0.37, (y0 + y1) / 2, z), mat=st, bevel=0.0))
        objs.append(box('levh%d' % k, (0.12, y1 - y0 - 0.1, 0.024), (XI - 0.81, (y0 + y1) / 2, z),
                        mat=X.hazard(X.LINE_YEL, X.INK, 6.0, 45.0, ('X', 'Y')), bevel=0.0))
    # entrance doormat inside
    objs.append(X.decal_box('mat_in', ENTR[0] + 0.05, ENTR[1] - 0.05, -YI + 0.02, -YI + 0.6, flat('#6B4A3A', 0.9), z,
                            t=0.015))
    return objs


def apron():
    """Outside ground: dock apron along +X with bay lines, entrance landing + receiving pad along -Y."""
    objs = []
    cm = X.concrete('#B9BEC6', '#A7ADB7', 1.3)
    objs.append(box('apronX', (1.65, 2 * Y0 + 0.85, 0.12), (X0 + 0.8, -0.45, -0.12), mat=cm, bevel=0.03))
    ym = flat(X.LINE_YEL, 0.6)
    for y in (DOCK1[0] - 0.2, DOCK1[1] + 0.2, DOCK2[0] - 0.2, DOCK2[1] + 0.2):
        objs.append(X.floor_line('bayl', (X0 + 0.05, y), (X0 + 1.55, y), 0.08, ym, 0.0))
    for k, (y0, y1, _) in enumerate((DOCK1, DOCK2)):
        objs.append(X.decal_box('dockhaz%d' % k, X0 + 0.02, X0 + 0.22, y0, y1,
                                X.hazard(X.LINE_YEL, X.INK, 5.0, 45.0, ('X', 'Y')), 0.0, t=0.012))
    objs.append(box('apronY', (4.7, 1.05, 0.12), (-1.3, -Y0 - 0.5, -0.12), mat=cm, bevel=0.03))
    objs.append(X.decal_box('mat_out', ENTR[0] + 0.05, ENTR[1] - 0.05, -Y0 - 0.75, -Y0 - 0.12, flat('#8A3B2E', 0.9),
                            0.0, t=0.015))
    # receiving pad (inPoint): yellow frame with a box symbol
    x0, x1, y0, y1 = 1.4, 3.3, -5.35, -4.2
    objs.append(box('recv', (x1 - x0 + 0.2, y1 - y0 + 0.2, 0.1), ((x0 + x1) / 2, (y0 + y1) / 2, -0.1), mat=cm,
                    bevel=0.03))
    for (p, q) in (((x0, y0), (x1, y0)), ((x1, y0), (x1, y1)), ((x1, y1), (x0, y1)), ((x0, y1), (x0, y0))):
        objs.append(X.floor_line('recvl', p, q, 0.09, ym, 0.0))
    cxm, cym = (x0 + x1) / 2, (y0 + y1) / 2
    objs.append(X.decal_box('recvbox', cxm - 0.3, cxm + 0.3, cym - 0.25, cym + 0.25, flat(X.KRAFT, 0.7), 0.0))
    objs.append(X.decal_box('recvtape', cxm - 0.06, cxm + 0.06, cym - 0.25, cym + 0.25, flat(X.TAPE, 0.5), 0.002))
    POINTS['inPoint'] = wpt(cxm, cym)
    return objs


# =================================================================================================== racks

def rack_unit(name, length, depth, levels, top, cat, header=True, slots_per_level=2, sign_psi=None):
    """Pallet rack built in a local frame: length along +X (x in [-L/2, L/2]), front at y = 0 facing -Y, depth along
    +Y.  Blue perforated uprights, orange beams, wooden decks, diagonal bracing on the end frames, a category colour
    tag on every beam and a round category sign on top.  Returns (objs, slots) with slots in LOCAL coordinates."""
    up = flat(X.RACK_BLUE, 0.45, 0.2)
    beam = flat(X.RACK_ORANGE, 0.4, 0.15)
    deck = tonal(X.DECK_WOOD, 0.08, 6.0, rough=0.75)
    objs = []
    mb = L2.MB()
    mbf = L2.MB()                       # FRONT uprights: own object -> group 'rackf' (drawn above the stock)
    hl = length / 2
    for x in (-hl + 0.04, hl - 0.04):
        for y in (0.04, depth - 0.04):
            m_ = mbf if y < depth / 2 else mb
            m_.cube((0.08, 0.08, top), up, loc=(x, y, top / 2))
            m_.cube((0.16, 0.14, 0.02), up, loc=(x, y, 0.01))
            for k in range(int(top / 0.12)):
                m_.cube((0.025, 0.084, 0.04), flat('#2E5A93', 0.5), loc=(x, y, 0.1 + k * 0.12))
        # end-frame bracing (zig-zag)
        n = 4
        for k in range(n):
            z0, z1 = 0.15 + (top - 0.3) * k / n, 0.15 + (top - 0.3) * (k + 1) / n
            p = (x, 0.06, z0) if k % 2 == 0 else (x, depth - 0.06, z0)
            q = (x, depth - 0.06, z1) if k % 2 == 0 else (x, 0.06, z1)
            mb.seg(p, q, 0.018, up, segs=6)
        mb.cube((0.05, depth, 0.04), up, loc=(x, depth / 2, top - 0.05))
    objs.append(mb.done(name + '_up', smooth=False))
    objs.append(mbf.done(name + '_rf_up', smooth=False))
    cm = flat(CAT_COL[cat], 0.5)
    slots = []
    for li, z in enumerate(levels):
        for y in (0.0, depth):
            objs.append(box(name + ('_rf_beam' if y == 0 else '_beam'), (length - 0.12, 0.07, 0.11),
                            (0, y + (0.035 if y == 0 else -0.035), z - 0.11), mat=beam, bevel=0.012))
        objs.append(box(name + '_deck', (length - 0.14, depth - 0.06, 0.035), (0, depth / 2, z - 0.035), mat=deck,
                        bevel=0.006))
        for k in range(1, 5):
            objs.append(box(name + '_dk', (0.012, depth - 0.07, 0.006), (-hl + length * k / 5, depth / 2, z - 0.001),
                            mat=flat('#B98A50', 0.8), bevel=0.0))
        # category tags on the front beam (small coloured labels)
        for j in range(slots_per_level):
            xs = -hl + length * (j + 0.5) / slots_per_level
            objs.append(box(name + '_rf_tag', (0.22, 0.012, 0.07), (xs, -0.005, z - 0.095), mat=cm, bevel=0.004))
            objs.append(box(name + '_rf_tagw', (0.12, 0.014, 0.03), (xs - 0.02, -0.007, z - 0.075),
                            mat=flat('#FBF6EA', 0.6), bevel=0.0))
            slots.append({'level': li, 'slot': j, 'local': (xs, depth / 2, z), 'width': length / slots_per_level})
    if header:
        objs.append(T.sign_disc(name + '_sign', (0, depth * 0.35, top + 0.36), r=0.34, bg=CAT_COL[cat],
                                rim='#F4F1EA', psi=T.CAM_PSI if sign_psi is None else sign_psi, tilt=8.0,
                                emblem=EMBLEM[cat], es=0.72, snow=False))
        objs.append(box(name + '_sp', (0.06, 0.06, 0.2), (0, depth * 0.35, top - 0.05), mat=up, bevel=0.01))
    return objs, slots


# ------------------------------------------------------------------ category emblems (sign frame: XZ, toward -Y)

def _em_fn(builder, scale, dz=0.0, dy=-0.08, rot=(0, 0, 0)):
    def fn(s=1.0):
        with L.Collect() as c:
            builder()
        g = L.group(BA.top_level(c.objs), 'em', loc=(0, dy, dz * s), rot=rot)
        g.scale = (scale * s,) * 3
    return fn


def em_fish(s=1.0):
    PA.fish_model('emf', length=0.86, height=0.42, thick=0.2, loc=(0, -0.08 * s, 0), rot=(90, 0, 0)).scale = \
        (0.72 * s,) * 3


def em_can(s=1.0):
    BA.can_model('emc', r=0.2 * s, h=0.34 * s, loc=(0, -0.12 * s, -0.17 * s), label='#4F95D9', fish=True,
                 fish_psi=0.0)


EMBLEM = {
    'food': em_fish,
    'goods': em_can,
    'tools': T.em_hammer_wrench,
    'appliances': _em_fn(lambda: X.fridge_model('emfr', 0.42, 0.3, 0.8, '#9FD8C8'), 0.72, dz=-0.36),
    'furniture': _em_fn(lambda: X.chair_model('emch', 1.0, '#C98F55', '#D9483B'), 0.82, dz=-0.42),
    'materials': _em_fn(lambda: PA.log_pile('emlog', n_bottom=3, r=0.12, length=0.7, snow=False), 0.9, dz=-0.2,
                        rot=(0, 0, 0)),
}


# =================================================================================================== interior

def racks():
    objs, slots = [], []
    for key, cat, x0, x1 in BACK_RACKS:
        with L.Collect() as c:
            o, sl = rack_unit(key, x1 - x0, RACK_D, RACK_LEVELS, RACK_TOP, cat)
        L.group(BA.top_level(c.objs), key + '_g', loc=((x0 + x1) / 2, RACK_YF, 0))
        objs += c.objs
        for s in sl:
            lx, ly, lz = s['local']
            slots.append(dict(rack=key, category=cat, level=s['level'], slot=s['slot'],
                              world=wpt((x0 + x1) / 2 + lx, RACK_YF + ly, lz), widthM=round(s['width'], 3),
                              face='SW', upper=(RACK_LEVELS[s['level'] + 1] if s['level'] + 1 < len(RACK_LEVELS)
                                                else None)))
    # furniture rack on the -X wall, facing +X (local front -Y -> world +X: rotate +90)
    L_ = FRACK_Y[1] - FRACK_Y[0]
    with L.Collect() as c:
        o, sl = rack_unit('rack_furniture', L_, FRACK_D, FRACK_LEVELS, FRACK_TOP, 'furniture', sign_psi=-45.0)
    L.group(BA.top_level(c.objs), 'rack_furniture_g', loc=(FRACK_XF, (FRACK_Y[0] + FRACK_Y[1]) / 2, 0),
            rot=(0, 0, 90))
    objs += c.objs
    yc = (FRACK_Y[0] + FRACK_Y[1]) / 2
    for s in sl:
        lx, ly, lz = s['local']
        slots.append(dict(rack='rack_furniture', category='furniture', level=s['level'], slot=s['slot'],
                          world=wpt(FRACK_XF - ly, yc + lx, lz), widthM=round(s['width'], 3), face='SE',
                          upper=(FRACK_LEVELS[s['level'] + 1] if s['level'] + 1 < len(FRACK_LEVELS) else None)))
    # materials floor bays (pallets stand on the floor) + their post sign
    for k, (x0, x1, y0, y1) in enumerate(BAYS):
        slots.append(dict(rack='floor_bays', category='materials', level=0, slot=k,
                          world=wpt((x0 + x1) / 2, (y0 + y1) / 2, 0.0), widthM=round(x1 - x0, 3), face='S',
                          upper=None))

    POINTS['rackSlots'] = slots
    return objs


def conveyor_static():
    """Belt conveyor body (static parts) + hoods at both ends; the belt + boxes are the 'belt' group."""
    x0, x1, y0, y1, zb = CONV
    fm = flat('#5CB86A', 0.45, 0.1)          # green frame
    dm = flat('#3E8E57', 0.5)
    lm = flat('#5A606B', 0.5, 0.4)
    objs = []
    L_ = x1 - x0
    xc, yc = (x0 + x1) / 2, (y0 + y1) / 2
    w = y1 - y0
    objs.append(box('cv_body', (L_, w - 0.06, 0.18), (xc, yc, zb - 0.2), mat=flat('#3B3F48', 0.6), bevel=0.02))
    for s in (-1, 1):
        objs.append(box('cv_rail', (L_, 0.06, 0.2), (xc, yc + s * (w / 2 - 0.03), zb - 0.14), mat=fm, bevel=0.02))
        objs.append(box('cv_lip', (L_, 0.05, 0.05), (xc, yc + s * (w / 2 - 0.025), zb + 0.02), mat=dm, bevel=0.012))
    for x in np_lin(x0 + 0.25, x1 - 0.25, 5):
        for s in (-1, 1):
            objs.append(box('cv_leg', (0.07, 0.07, zb - 0.2), (x, yc + s * (w / 2 - 0.08), 0), mat=lm, bevel=0.01))
        objs.append(box('cv_cross', (0.05, w - 0.16, 0.05), (x, yc, 0.25), mat=lm, bevel=0.008))
    for x in np_lin(x0 + 0.1, x1 - 0.1, 9):
        objs.append(cyl('cv_roll', 0.05, w - 0.1, (x, yc, zb - 0.05), rot=(90, 0, 0), mat=flat('#C3CCD8', 0.3, 0.7),
                        segs=12, origin='center', bevel=0.005))
    # feeder hood (left) with rubber curtain + labeller arch (right) with a lamp
    hm = flat('#F2C230', 0.45)
    objs.append(box('hoodL', (0.62, w + 0.16, 0.52), (x0 + 0.31, yc, zb - 0.02), mat=hm, bevel=0.06))
    objs.append(box('hoodL_mouth', (0.04, w - 0.06, 0.3), (x0 + 0.63, yc, zb), mat=flat('#2B2F3A', 0.8),
                    bevel=0.0))
    mb = L2.MB()
    for k in range(6):
        yy = y0 + 0.07 + (w - 0.14) * k / 5
        mb.cube((0.015, (w - 0.14) / 6, 0.28), flat('#4A505A', 0.7), loc=(x0 + 0.655, yy, zb + 0.15))
    objs.append(mb.done('hoodL_strips'))
    objs.append(box('hoodR_l', (0.12, 0.12, 0.62), (x1 - 0.32, y0 - 0.02, zb - 0.02), mat=flat('#E8823A', 0.45),
                    bevel=0.03))
    objs.append(box('hoodR_r', (0.12, 0.12, 0.62), (x1 - 0.32, y1 + 0.02, zb - 0.02), mat=flat('#E8823A', 0.45),
                    bevel=0.03))
    objs.append(box('hoodR_top', (0.3, w + 0.28, 0.16), (x1 - 0.32, yc, zb + 0.58), mat=flat('#E8823A', 0.45),
                    bevel=0.04))
    objs.append(sphere('hoodR_lamp', 0.06, (x1 - 0.32, yc, zb + 0.78), L.emissive('lab_lamp', '#5CC86A', '#7CF08A',
                                                                                  2.0), segs=12, rings=8))
    objs.append(box('hoodR_scan', (0.04, w - 0.1, 0.03), (x1 - 0.32, yc, zb + 0.5),
                    mat=L.emissive('scan', '#E8433A', '#FF6A5A', 2.4), bevel=0.0))
    # control box with a big red button on the front leg
    objs.append(box('cv_ctrl', (0.22, 0.12, 0.28), (x0 + 1.0, y0 - 0.08, 0.45), mat=flat('#F4F1EA', 0.5), bevel=0.03))
    objs.append(cyl('cv_btn', 0.045, 0.04, (x0 + 1.0, y0 - 0.15, 0.62), rot=(90, 0, 0), mat=flat('#E8433A', 0.3),
                    segs=14, origin='center', bevel=0.01))
    objs.append(cyl('cv_btn2', 0.03, 0.04, (x0 + 1.0, y0 - 0.15, 0.53), rot=(90, 0, 0), mat=flat('#5CC86A', 0.3),
                    segs=12, origin='center', bevel=0.01))
    POINTS['conveyor'] = {'start': wpt(x0 + 0.65, yc, zb), 'end': wpt(x1 - 0.32, yc, zb), 'axis': 'x',
                          'heightM': zb}
    return objs


def np_lin(a, b, n):
    return [a + (b - a) * k / (n - 1) for k in range(n)]


def belt_parts():
    """The moving parts: belt with cleats (period CLEAT_P) + identical boxes every BELT_SPACING.  set_belt(f) moves
    both by f / BELT_FRAMES of one box spacing (seamless 8-frame loop)."""
    x0, x1, y0, y1, zb = CONV
    yc, w = (y0 + y1) / 2, y1 - y0
    objs = []
    objs.append(box('belt', (x1 - x0 - 0.1, w - 0.12, 0.03), ((x0 + x1) / 2, yc, zb - 0.03),
                    mat=flat('#3A3E47', 0.75), bevel=0.0))
    cleat_m = flat('#6E7682', 0.6)
    cleats = []
    n = int((x1 - x0) / CLEAT_P) + 3
    for k in range(n):
        c = box('cleat', (0.06, w - 0.14, 0.012), (0, yc, zb - 0.002), mat=cleat_m, bevel=0.0)
        cleats.append((c, x0 - CLEAT_P + k * CLEAT_P))
    boxes = []
    for k in range(4):
        g = X.cardboard_box('beltbox%d' % k, 0.42, 0.34, 0.28, loc=(0, yc, zb), rot_z=0.0, seed=k)
        boxes.append((g, x0 - 0.1 + k * BELT_SPACING))
    vis_lo, vis_hi = x0 + 0.32, x1 - 0.02

    def set_belt(f):
        sh = BELT_SPACING * (f % BELT_FRAMES) / BELT_FRAMES
        for c, xb in cleats:
            x = xb + (sh % CLEAT_P)
            c.location.x = x
            c.hide_render = not (x0 + 0.08 < x < x1 - 0.08)
        for g, xb in boxes:
            x = xb + sh
            g.location.x = x
            hide = not (vis_lo < x < vis_hi)
            for o in [g] + list(g.children_recursive):
                o.hide_render = hide
    objs += [c for c, _ in cleats] + [g for g, _ in boxes]
    return objs, set_belt


def packing_table():
    x0, x1, y0, y1, zt = PACK
    wm = tonal('#D9A766', 0.07, 5.0, rough=0.6)
    lm = flat('#5A606B', 0.5, 0.4)
    xc, yc = (x0 + x1) / 2, (y0 + y1) / 2
    objs = [box('pt_top', (x1 - x0, y1 - y0, 0.07), (xc, yc, zt - 0.07), mat=wm, bevel=0.02),
            box('pt_shelf', (x1 - x0 - 0.1, y1 - y0 - 0.1, 0.04), (xc, yc, 0.22), mat=wm, bevel=0.01)]
    for x in (x0 + 0.06, x1 - 0.06):
        for y in (y0 + 0.06, y1 - 0.06):
            objs.append(box('pt_leg', (0.06, 0.06, zt - 0.07), (x, y, 0), mat=lm, bevel=0.01))
    # tape gun, scale with a parcel, flat boxes, bubble-wrap roll, a little radio
    objs.append(box('pt_scale', (0.36, 0.3, 0.06), (x0 + 0.35, yc + 0.05, zt), mat=flat('#F4F1EA', 0.4), bevel=0.02))
    objs.append(box('pt_disp', (0.12, 0.02, 0.07), (x0 + 0.35, y0 + 0.04, zt + 0.0), mat=L.emissive(
        'scale_lcd', '#7FD08A', '#A8F0B0', 1.2), bevel=0.0))
    objs.append(X.cardboard_box('pt_parcel', 0.3, 0.26, 0.22, loc=(x0 + 0.35, yc + 0.05, zt + 0.06), rot_z=8))
    objs.append(X.cardboard_box('pt_open', 0.4, 0.34, 0.24, loc=(x0 + 0.85, yc - 0.02, zt), rot_z=-6, tape=False,
                                label=False))
    for k in range(4):
        objs.append(box('pt_flat', (0.5, 0.4, 0.012), (x1 - 0.28, yc + 0.05, 0.27 + k * 0.016), rot=(0, 0, k * 3),
                        mat=X.kraft(), bevel=0.0))
    objs.append(cyl('pt_bubble', 0.11, 0.42, (x1 - 0.2, y1 - 0.18, zt + 0.11), rot=(90, 0, 0),
                    mat=flat('#DDEEF8', 0.25), segs=18, origin='center', bevel=0.02))
    objs.append(cyl('pt_tape', 0.06, 0.05, (x0 + 0.85, y0 + 0.12, zt + 0.03), rot=(0, 0, 0), mat=flat(X.TAPE, 0.4),
                    segs=16, origin='center', bevel=0.01))
    objs.append(box('pt_tapeh', (0.04, 0.12, 0.1), (x0 + 0.92, y0 + 0.12, zt), mat=flat('#D9483B', 0.4),
                    bevel=0.01))
    with L.Collect() as c:
        for o in X.radio_model('pt_radio', 0.3, 0.15, 0.2, '#B9783F'):
            pass
    L.group(BA.top_level(c.objs), 'pt_radio_g', loc=(x1 - 0.3, y0 + 0.15, zt), rot=(0, 0, 30))
    objs += c.objs
    return objs


def office_front():
    """Settlement counter (front furniture: the clerk stands behind it)."""
    x0, x1, y0, y1, zc = COUNTER
    wm = tonal('#C98F55', 0.07, 5.0, rough=0.55)
    pm = flat('#3E8E57', 0.55)
    front = []
    xc, yc = (x0 + x1) / 2, (y0 + y1) / 2
    front.append(box('ct_body', (x1 - x0, y1 - y0 - 0.08, zc - 0.06), (xc, yc + 0.04, 0), mat=pm, bevel=0.03))
    front.append(box('ct_kick', (x1 - x0 - 0.04, 0.06, 0.12), (xc, y0 + 0.05, 0.0), mat=flat('#2E6B4F', 0.6),
                     bevel=0.01))
    for k in range(4):
        front.append(box('ct_pan', ((x1 - x0) / 4 - 0.12, 0.02, zc - 0.36), (x0 + (x1 - x0) * (k + 0.5) / 4,
                                                                              y0 + 0.04, 0.2),
                         mat=flat('#4FA06A', 0.5), bevel=0.012))
    front.append(box('ct_top', (x1 - x0 + 0.06, y1 - y0 + 0.08, 0.07), (xc, yc, zc - 0.06), mat=wm, bevel=0.025))
    # big open ledger, stamp + ink pad, bell, coin tray, receipt spike, abacus
    lm = flat('#FBF6EA', 0.7)
    front.append(box('ledger_l', (0.3, 0.38, 0.04), (xc - 0.17, yc, zc + 0.01), rot=(0, -5, 4), mat=lm, bevel=0.012))
    front.append(box('ledger_r', (0.3, 0.38, 0.04), (xc + 0.15, yc, zc + 0.01), rot=(0, 5, 4), mat=lm, bevel=0.012))
    front.append(box('ledger_c', (0.64, 0.4, 0.025), (xc - 0.01, yc, zc), rot=(0, 0, 4), mat=flat('#8C2F3A', 0.6),
                     bevel=0.01))
    mb = L2.MB()
    for k in range(6):
        for sx in (-0.17, 0.15):
            mb.cube((0.22, 0.012, 0.006), flat('#9AA3AF', 0.7), loc=(xc + sx, yc - 0.13 + k * 0.05, zc + 0.052),
                    rot=(0, 0, 4))
    front.append(mb.done('ledger_lines'))
    front.append(cyl('stamp_b', 0.05, 0.06, (xc + 0.55, yc - 0.05, zc + 0.01), mat=flat('#D9483B', 0.4), segs=16,
                     bevel=0.01))
    front.append(cyl('stamp_h', 0.03, 0.12, (xc + 0.55, yc - 0.05, zc + 0.07), mat=flat('#8A5A33', 0.5), segs=12,
                     bevel=0.01))
    front.append(sphere('stamp_k', 0.045, (xc + 0.55, yc - 0.05, zc + 0.21), flat('#8A5A33', 0.5), segs=12, rings=8))
    front.append(box('inkpad', (0.16, 0.11, 0.025), (xc + 0.58, yc + 0.12, zc + 0.01), mat=flat('#3D7CC9', 0.4),
                     bevel=0.008))
    front.append(cyl('bell', 0.07, 0.03, (xc - 0.65, yc - 0.06, zc + 0.01), mat=flat('#3B3F48', 0.4), segs=16,
                     bevel=0.01))
    front.append(sphere('bell_d', 0.06, (xc - 0.65, yc - 0.06, zc + 0.04), flat('#F2C14E', 0.25, 0.85),
                        scale=(1, 1, 0.75), segs=14, rings=8))
    front.append(box('tray', (0.26, 0.18, 0.04), (x0 + 0.3, yc + 0.02, zc + 0.01), mat=flat('#8A5A33', 0.5),
                     bevel=0.01))
    for k in range(5):
        front.append(cyl('coin', 0.035, 0.012, (x0 + 0.24 + (k % 3) * 0.05, yc - 0.01 + (k // 3) * 0.06,
                                                zc + 0.05 + 0.006 * k), mat=flat('#F2C14E', 0.3, 0.8), segs=12,
                         bevel=0.003))
    front.append(cyl('spike', 0.008, 0.18, (x1 - 0.2, yc + 0.1, zc + 0.01), mat=flat(X.STEEL_D, 0.3, 0.7), segs=6,
                     bevel=0.0))
    for k in range(3):
        front.append(box('rcpt', (0.1, 0.12, 0.006), (x1 - 0.2, yc + 0.1, zc + 0.04 + k * 0.03), rot=(0, 0, k * 25),
                         mat=flat('#FBF6EA', 0.8), bevel=0.0))
    # counter sign board (blank, faces the customers) on a little post
    front.append(box('ct_post', (0.05, 0.05, 0.45), (x0 + 0.95, y1 - 0.06, zc), mat=flat(X.INK, 0.5), bevel=0.01))
    front.append(box('ct_sign', (0.62, 0.05, 0.26), (x0 + 0.95, y1 - 0.06, zc + 0.42), mat=flat(SIGN_YEL, 0.45),
                     bevel=0.02))
    front.append(box('ct_signw', (0.5, 0.055, 0.15), (x0 + 0.95, y1 - 0.065, zc + 0.475), mat=flat('#FBF6EA', 0.55),
                     bevel=0.01))
    return front


def office_back():
    """The office corner behind the clerk: desk, abacus, cabinet, safe, plants, heater + sleeping cat."""
    wm = tonal('#C98F55', 0.07, 5.0, rough=0.55)
    back = []
    dx0, dx1, dy0, dy1, dz = -5.2, -4.6, -1.8, -0.75, 0.78
    back.append(box('desk', (dx1 - dx0, dy1 - dy0, 0.06), ((dx0 + dx1) / 2, (dy0 + dy1) / 2, dz - 0.06), mat=wm,
                    bevel=0.02))
    back.append(box('desk_ped', (dx1 - dx0 - 0.04, 0.42, dz - 0.06), ((dx0 + dx1) / 2, dy0 + 0.23, 0), mat=wm,
                    bevel=0.02))
    for k in range(3):
        back.append(box('desk_drw', (0.02, 0.36, 0.18), (dx1 + 0.0, dy0 + 0.23, 0.08 + k * 0.22), mat=flat('#B07A48',
                                                                                                      0.5),
                        bevel=0.01))
        back.append(sphere('desk_knob', 0.02, (dx1 + 0.02, dy0 + 0.23, 0.17 + k * 0.22), flat('#F2C14E', 0.3, 0.8),
                           segs=8, rings=5))
    back.append(box('desk_leg', (0.06, 0.06, dz - 0.06), (dx1 - 0.05, dy1 - 0.05, 0), mat=wm, bevel=0.01))
    # papers, abacus, mug, plant on the desk
    back.append(box('papers', (0.3, 0.22, 0.04), (-4.9, -1.0, dz), rot=(0, 0, 12), mat=flat('#FBF6EA', 0.7),
                    bevel=0.005))
    ab = L2.MB()
    fr = flat('#6B4226', 0.6)
    ab.cube((0.42, 0.03, 0.03), fr, loc=(0, -0.09, 0.015))
    ab.cube((0.42, 0.03, 0.03), fr, loc=(0, 0.09, 0.015))
    ab.cube((0.03, 0.21, 0.03), fr, loc=(-0.2, 0, 0.015))
    ab.cube((0.03, 0.21, 0.03), fr, loc=(0.2, 0, 0.015))
    for k in range(7):
        x = -0.17 + k * 0.057
        ab.seg((x, -0.09, 0.03), (x, 0.09, 0.03), 0.004, flat(X.INK, 0.5))
        for j in range(4):
            ab.sphere(0.018, flat(['#D9483B', '#F2C230'][(k + j) % 2], 0.4), loc=(x, -0.06 + j * 0.035, 0.03),
                      scale=(1.2, 0.8, 1), segs=8, rings=5)
    back.append(ab.done('abacus', loc=(-4.88, -1.5, dz), rot=(0, 0, 90)))
    back.append(cyl('mug', 0.045, 0.1, (-5.05, -1.65, dz), mat=flat('#F4F1EA', 0.4), segs=14, bevel=0.01))
    back.append(cyl('mug_t', 0.04, 0.01, (-5.05, -1.65, dz + 0.09), mat=flat('#6B3E26', 0.3), segs=14, bevel=0.0))
    # filing cabinet + safe + plant + coat rack
    back.append(box('cab', (0.45, 0.5, 1.2), (-4.97, -0.4, 0), mat=flat('#9AA4B1', 0.4, 0.3), bevel=0.03))
    for k in range(3):
        back.append(box('cab_d', (0.02, 0.42, 0.34), (-4.74, -0.4, 0.07 + k * 0.38), mat=flat('#B3BECB', 0.35, 0.3),
                        bevel=0.01))
        back.append(box('cab_h', (0.03, 0.14, 0.03), (-4.72, -0.4, 0.3 + k * 0.38), mat=flat('#5A606B', 0.3, 0.6),
                        bevel=0.005))
    back.append(T.flower_tub('plant', (-4.97, -0.4, 1.2), r=0.16, flowers=('#3E7F55', '#2E6B4F', '#5CA84E'),
                             evergreen=True, seed=2))
    back.append(box('safe', (0.5, 0.45, 0.55), (-4.95, -3.35, 0), mat=flat('#3B4A5E', 0.4, 0.4), bevel=0.05))
    back.append(cyl('safe_dial', 0.07, 0.03, (-4.69, -3.35, 0.32), rot=(0, 90, 0), mat=flat('#D9DFE6', 0.25, 0.85),
                    segs=18, origin='center', bevel=0.008))
    back.append(box('safe_h', (0.03, 0.14, 0.03), (-4.69, -3.2, 0.18), mat=flat('#D9DFE6', 0.25, 0.85), bevel=0.005))
    back.append(T.flower_tub('plant2', (-4.95, -3.35, 0.55), r=0.15, flowers=('#E8524A', '#F2C14E', '#F28DB2'),
                             seed=5))
    # heater (난로) with a kettle + a cat curled up on a cushion beside it
    with L.Collect() as c:
        X.stove_model('heater', 1.15)
    L.group(BA.top_level(c.objs), 'heater_g', loc=(-3.55, -1.15, 0), rot=(0, 0, 30))
    back += c.objs
    back.append(cyl('cushion', 0.24, 0.08, (-3.55, -0.55, 0), mat=flat('#D9483B', 0.75), segs=24, bevel=0.035,
                    scale=(1.0, 0.85, 1)))
    back += cat_model('cat', (-3.55, -0.55, 0.08))
    return back


def cat_model(name, loc):
    """A ginger cat curled up asleep (closed ^^ eyes) - a tiny surprise for the designer."""
    fur = flat('#F0A35A', 0.75)
    light = flat('#FBE3C4', 0.8)
    x, y, z = loc
    objs = [sphere(name + '_body', 0.15, (x, y, z + 0.09), fur, scale=(1.25, 0.95, 0.62), segs=20, rings=12),
            sphere(name + '_head', 0.095, (x + 0.12, y - 0.08, z + 0.13), fur, scale=(1, 0.95, 0.85), segs=18,
                   rings=10),
            sphere(name + '_muz', 0.045, (x + 0.15, y - 0.15, z + 0.11), light, scale=(1.1, 0.8, 0.8), segs=12,
                   rings=8)]
    for s in (-1, 1):
        objs.append(L.box(name + '_ear', (0.06, 0.03, 0.07), (x + 0.12 + s * 0.05, y - 0.06, z + 0.2),
                          rot=(0, s * 12, 0), mat=fur, bevel=0.012, taper=(0.15, 0.4)))
    mb = L2.MB()
    em = flat('#3A2A22', 0.6)
    for s in (-1, 1):
        a0 = Vector((x + 0.12 + s * 0.035, y - 0.165, z + 0.15))
        mb.seg(a0 + Vector((-0.018, 0, 0.006)), a0 + Vector((0, 0, -0.004)), 0.006, em, segs=5)
        mb.seg(a0 + Vector((0, 0, -0.004)), a0 + Vector((0.018, 0, 0.006)), 0.006, em, segs=5)
    tail = [Vector((x - 0.17, y + 0.02, z + 0.05)), Vector((x - 0.12, y - 0.13, z + 0.04)),
            Vector((x + 0.02, y - 0.18, z + 0.04))]
    for p, q in zip(tail, tail[1:]):
        mb.seg(p, q, 0.035, fur, segs=10)
    for k in range(3):
        mb.cube((0.012, 0.13, 0.008), flat('#D9823A', 0.8), loc=(x - 0.06 + k * 0.06, y, z + 0.18), rot=(0, 0, 10))
    objs.append(mb.done(name + '_det'))
    return objs


def office_lamp_base():
    return [cyl('lamp_base', 0.08, 0.03, (-4.95, -1.25, 0.78), mat=flat('#F2C14E', 0.3, 0.8), segs=16, bevel=0.01),
            cyl('lamp_stem', 0.015, 0.36, (-4.95, -1.25, 0.8), mat=flat('#F2C14E', 0.3, 0.8), segs=8, bevel=0.0)]


def office_lamp_head():
    """Green banker's desk lamp head (shade + glowing bulb + a warm point light) = the 'lamp' group.
    Returns set_lamp(f) for the 4-frame glow loop."""
    gm = L.emissive('lamp_glow', '#FFE2A0', '#FFD27A', 2.0)
    box('lamp_shade', (0.32, 0.16, 0.08), (-4.86, -1.25, 1.12), rot=(0, -8, 0), mat=flat('#2E8B57', 0.25),
        bevel=0.04, taper=(0.75, 0.75))
    box('lamp_bulb', (0.26, 0.11, 0.02), (-4.86, -1.25, 1.115), mat=gm, bevel=0.01)
    pl = L.point_light('lamp_light', (-4.84, -1.25, 1.02), '#FFD27A', 14.0, 0.05)
    levels = [1.0, 1.35, 1.6, 1.3]

    def set_lamp(f):
        k = levels[f % 4]
        L.set_emission(gm, 2.0 * k)
        pl.data.energy = 14.0 * k
    POINTS['lampPoint'] = wpt(-4.86, -1.25, 1.1)
    return set_lamp


def interior_decor():
    objs = []
    # stack of empty pallets + a hand truck + traffic cones near the docks / front zone
    for k in range(4):
        objs.append(X.pallet('epal%d' % k, 0.78, 0.78, 0.12, loc=(0.1, -3.25, k * 0.12), rot_z=(k % 2) * 4))
    ht = L2.MB()
    hm = flat('#D9483B', 0.4)
    ht.seg((0, 0.0, 0.05), (0, 0.12, 1.1), 0.02, hm)
    ht.seg((0.36, 0.0, 0.05), (0.36, 0.12, 1.1), 0.02, hm)
    ht.seg((0, 0.12, 1.1), (0.36, 0.12, 1.1), 0.02, hm)
    ht.seg((0, 0.06, 0.55), (0.36, 0.06, 0.55), 0.015, hm)
    ht.cube((0.42, 0.2, 0.03), flat(X.STEEL_D, 0.4, 0.5), loc=(0.18, -0.08, 0.03))
    for x in (-0.04, 0.4):
        ht.cone(0.09, 0.09, 0.06, flat(X.RUBBER, 0.6), loc=(x, 0.08, 0.09), rot=(0, 90, 0), segs=14)
    objs.append(ht.done('handtruck', loc=(-0.65, -3.5, 0), rot=(0, 0, 12)))
    for k, (x, y) in enumerate(((CORR_X + 0.7, -0.2), (3.95, 2.95), (-0.8, 2.95))):
        if k != 0:                      # k 1 stood inside the appliances rack (stock slot), k 2 in the lane
            continue
        objs.append(cyl('cone%d' % k, 0.13, 0.42, (x, y, 0.03), mat=X.hazard('#F08A2D', '#F4F1EA', 6.0, 0.0,
                                                                              ('X', 'Z')),
                        r_top=0.025, segs=16, bevel=0.01))
        objs.append(box('coneb%d' % k, (0.32, 0.32, 0.04), (x, y, 0.0), mat=flat('#F08A2D', 0.5), bevel=0.01))
    # broom + bins + ladder in the free back-left corner
    bm = L2.MB()
    bm.seg((-5.0, 3.35, 0.25), (-4.85, 3.5, 1.45), 0.02, flat('#C98F55', 0.6))
    bm.cube((0.32, 0.08, 0.16), flat('#E2B85A', 0.8), loc=(-5.0, 3.33, 0.1), rot=(0, 0, 45))
    objs.append(bm.done('broom'))
    objs.append(cyl('bin', 0.22, 0.6, (-4.6, 3.3, 0), mat=flat('#3E8E57', 0.5), segs=20, bevel=0.03))
    objs.append(cyl('bin_lid', 0.24, 0.05, (-4.6, 3.3, 0.6), mat=flat('#2E6B4F', 0.5), segs=20, bevel=0.02))
    objs.append(cyl('bin2', 0.2, 0.55, (-4.95, 2.9, 0), mat=flat('#3D7CC9', 0.5), segs=20, bevel=0.03))
    lad = L2.MB()
    lm = flat('#C3CCD8', 0.35, 0.6)
    for s in (0.0, 0.42):
        lad.seg((-5.15, 2.55 + s, 0.0), (-5.15, 2.55 + s, 2.4), 0.025, lm)
    for k in range(7):
        lad.seg((-5.15, 2.55, 0.3 + k * 0.3), (-5.15, 2.97, 0.3 + k * 0.3), 0.018, lm)
    objs.append(lad.done('ladder', loc=(0.1, 0, 0), rot=(0, -8, 0)))
    # water cooler near the entrance
    objs.append(box('wc_base', (0.34, 0.34, 0.9), (-0.55, -3.45, 0), mat=flat('#F4F1EA', 0.4), bevel=0.04))
    objs.append(cyl('wc_jug', 0.15, 0.36, (-0.55, -3.45, 0.9), mat=flat('#9CC7E6', 0.12), segs=20, bevel=0.06))
    objs.append(box('wc_tap', (0.06, 0.06, 0.06), (-0.55, -3.64, 0.66), mat=flat('#3D7CC9', 0.4), bevel=0.01))
    return objs


# =================================================================================================== shell

def vault_pts(r, k, n=28, a0=0.0, a1=math.pi):
    return [(r * math.cos(a0 + (a1 - a0) * j / n), k * r * math.sin(a0 + (a1 - a0) * j / n)) for j in range(n + 1)]


def roof():
    """Barrel vault along X (spans Y), corrugated, with snow on top (snowy material + a thick rounded snow cap),
    roof vents and the giant parcel on the ridge."""
    R = Y0 + OVER
    kk = RISE / R
    t = 0.16
    outer = vault_pts(R, kk, 40)
    inner = [(x * (R - t) / R, z * (R - t) / R) for x, z in reversed(outer)]
    pts = outer + inner
    rm = L.NB('roof_corr', rough=0.55, metal=0.1)
    # corrugation along X + snow on up-facing normals
    tc = rm.n('ShaderNodeTexCoord')
    sep = rm.n('ShaderNodeSeparateXYZ')
    rm.link(tc.outputs['Object'], sep.inputs[0])
    s = rm.math('SINE', rm.math('MULTIPLY', sep.outputs['Z'], 9.0 * math.tau))
    corr = rm.mix_rgb(rm.map_range(s, -1.0, 1.0), hexmix(ROOF, '#000000', 0.15), C(ROOF))
    geo = rm.n('ShaderNodeNewGeometry')
    sn = rm.n('ShaderNodeSeparateXYZ')
    rm.link(geo.outputs['Normal'], sn.inputs[0])
    nz = rm.noise(1.6, 3.0)
    t_ = rm.math('ADD', sn.outputs['Z'], rm.math('MULTIPLY', rm.math('SUBTRACT', nz, 0.5), 0.3))
    col = rm.mix_rgb(rm.map_range(t_, 0.84, 0.9), corr, C('snow_mat'))
    rm.base(col)
    o = extrude('roof', pts, 2 * (X0 + 0.25), rot=(90, 0, 90), top=rm.m, side=rm.m, bevel=0.02)
    o.location = (-(X0 + 0.25), 0, EAVE)
    objs = [o]
    # thick snow cap on the crown
    sm = flat('snow_mat', 0.9)
    A0, A1 = math.radians(62), math.radians(118)
    cap = vault_pts(R - 0.02, kk, 24, A0, A1)
    cap_in = [(x * (R - 0.1) / R, z * (R - 0.1) / R) for x, z in reversed(vault_pts(R - 0.02, kk, 24, A0, A1))]
    cap_o = [(x * (R + 0.16) / R, z * (R + 0.16) / R) for x, z in cap]
    so = extrude('roof_snow', cap_o + cap_in, 2 * (X0 + 0.18), rot=(90, 0, 90), top=sm, side=sm, bevel=0.06,
                 segs=3)
    so.location = (-(X0 + 0.18), 0, EAVE)
    objs.append(so)
    # snow overhang lumps along both eaves of the cap
    rnd = L.rng(11)
    for k in range(14):
        x = -X0 + 0.4 + (2 * X0 - 0.8) * k / 13
        for sgn in (-1, 1):
            a = A1 if sgn < 0 else A0
            yy, zz = (R + 0.04) * math.cos(a), kk * (R + 0.04) * math.sin(a)
            objs.append(blob('rsnow', rnd.uniform(0.2, 0.3), (x + rnd.uniform(-0.12, 0.12), yy, EAVE + zz - 0.02),
                             sm, scale=(1.5, 1.1, 0.42), seed=k * 3 + (sgn > 0), amp=0.18, subdiv=2))
    # icicles along both eaves and snow drift on the eave edge
    im = L.NB('icicle', rough=0.12)
    im.p.inputs['Base Color'].default_value = im.rgb('#CFE6F7', raw=True)
    for sgn in (-1, 1):
        for k in range(26):
            x = -X0 - 0.1 + (2 * X0 + 0.2) * (k + 0.5) / 26 + rnd.uniform(-0.06, 0.06)
            ln = rnd.choice((0.14, 0.2, 0.26, 0.18, 0.32))
            objs.append(cyl('icicle', 0.035, ln, (x, sgn * (R - 0.06), EAVE + 0.02), rot=(180, 0, 0), mat=im.m,
                            r_top=0.004, segs=8, bevel=0.0))
    # giant parcel on the ridge (the centre's signature, like the cannery's tin can)
    pz = EAVE + RISE + 0.12
    box('pbase', (1.0, 0.8, 0.14), (-2.4, 0, pz - 0.1), mat=flat('#5E3A22', 0.8), bevel=0.03)
    X.cardboard_box('bigparcel', 1.0, 0.76, 0.74, loc=(-2.4, 0, pz), rot_z=0.0, tape=False, label=False)
    rmm = flat('#D9483B', 0.4)
    box('pr1', (0.16, 0.78, 0.75), (-2.4, 0, pz), mat=rmm, bevel=0.01)
    box('pr2', (1.02, 0.16, 0.75), (-2.4, 0, pz), mat=rmm, bevel=0.01)
    L2.bow('pbow', (-2.4, 0.0, pz + 0.8), 0.24, rmm, tails=0.0)
    L.snow_slab('psnow', 0.9, 0.66, 0.08, (-2.4, 0, pz + 0.74), seed=31)
    lab = flat('#FBF6EA', 0.6)
    box('plab', (0.34, 0.02, 0.24), (-2.12, -0.39, pz + 0.24), mat=lab, bevel=0.01)
    POINTS['fx_emblem'] = wpt(-2.4, 0, pz + 1.0)
    # eave trim (white band) along both long sides
    tm = flat(TRIM, 0.6)
    for sgn in (-1, 1):
        objs.append(box('eave', (2 * X0 + 0.5, 0.08, 0.14), (0, sgn * (R - 0.02), EAVE - 0.08), mat=tm, bevel=0.02))
    # roof vents (round turbine vents) on the crown
    vm = flat('#C3CCD8', 0.3, 0.6)
    for k, x in enumerate((-3.6, -1.2, 1.2, 3.6)):
        z = EAVE + RISE + 0.1
        if abs(x - 1.2) < 0.1:
            continue
        objs.append(cyl('vent%d' % k, 0.16, 0.35, (x, 0.9, z - 0.25), mat=vm, segs=18, bevel=0.02))
        objs.append(sphere('venth%d' % k, 0.22, (x, 0.9, z + 0.12), vm, scale=(1, 1, 0.75), segs=18, rings=10))
        objs.append(L.snow_slab('vents%d' % k, 0.3, 0.3, 0.06, (x, 0.9, z + 0.26), seed=k))
    POINTS['fx_vents'] = [wpt(x, 0.9, EAVE + RISE + 0.45) for x in (-3.6, -1.2, 3.6)]
    return objs


def gables():
    """Half-ellipse gable walls under the vault at both ends; the +X gable carries the big round emblem."""
    R = Y0
    kk = RISE / (Y0 + OVER)
    pts = [(R * math.cos(math.pi * j / 28), kk * (Y0 + OVER) * math.sin(math.pi * j / 28) * 0.98) for j in range(29)]
    gm = X.corrugated(WALL_D, 9.0, 'Y', 0.12)
    objs = []
    for sgn in (-1, 1):
        g = extrude('gable', pts, TW, rot=(90, 0, 90), top=gm, side=gm, bevel=0.02)
        g.location = (sgn * (X0 - TW / 2) - TW / 2, 0, EAVE - 0.01)
        objs.append(g)
    # emblem disc on the +X gable: a parcel with wings -> 'delivery'
    objs.append(T.sign_disc('gsign', (X0 + 0.12, 0.0, EAVE + 0.82), r=0.62, bg='#F4F1EA', rim=SIGN_YEL, psi=90.0,
                            tilt=0.0, emblem=em_parcel, es=1.0, snow=True, t=0.1))
    # lunette vent strips either side
    for s in (-1, 1):
        for k in range(3):
            objs.append(box('gl', (0.05, 0.5, 0.05), (X0 + 0.02, s * 1.6, EAVE + 0.25 + k * 0.16),
                            mat=flat('#5E87B0', 0.5), bevel=0.01))
    return objs


def em_parcel(s=1.0):
    """Emblem: a kraft parcel with a red ribbon and two little wings (= fast delivery)."""
    k = s
    o = X.cardboard_box('emp', 0.44 * k, 0.3 * k, 0.36 * k, loc=(0, -0.1 * k, -0.2 * k), tape=False, label=False)
    rm = flat('#D9483B', 0.45)
    box('emp_r1', (0.07 * k, 0.32 * k, 0.37 * k), (0, -0.1 * k, -0.2 * k), mat=rm, bevel=0.0)
    box('emp_r2', (0.45 * k, 0.32 * k, 0.07 * k), (0, -0.1 * k, -0.06 * k), mat=rm, bevel=0.0)
    L2.bow('emp_bow', (0, -0.1 * k, 0.17 * k), 0.12 * k, rm, tails=0.0)
    wm = flat('#FBF6EA', 0.6)
    for sg in (-1, 1):
        pts = [(0, 0), (sg * 0.22, 0.08), (sg * 0.3, 0.2), (sg * 0.2, 0.18), (sg * 0.24, 0.27), (sg * 0.1, 0.2)]
        if sg < 0:
            pts = list(reversed(pts))
        w = extrude('emp_w', [(x * k, y * k) for x, y in pts], 0.04 * k, rot=(90, 0, 0), top=wm, side=wm, bevel=0.01)
        w.location = (sg * 0.24 * k, -0.05 * k, -0.08 * k)
    del o


def facade_front():
    """Details on the -Y facade: entrance double door + canopy + lamps, lit windows, the big blank name board,
    a bracket sign, a gutter downpipe."""
    objs = []
    # entrance
    objs.append(T.door('entr', ((ENTR[0] + ENTR[1]) / 2, -Y0 - 0.0, 0.0), face='y-', w=ENTR[1] - ENTR[0] - 0.12,
                       h=ENTR[2] - 0.1, col='#3E8E57', double=True, glass=True, step=False))
    with L.Collect() as c:
        PA.awning(ENTR[1] - ENTR[0] + 0.9, 0.9, ENTR[2] + 0.55, ENTR[2] + 0.25, -Y0 - 0.02, -Y0 - 0.95, '#3E8E57',
                  'cream', 8, name='entr_awn', x=(ENTR[0] + ENTR[1]) / 2)
    objs += c.objs
    for x in (ENTR[0] - 0.35, ENTR[1] + 0.35):
        objs.append(T.lamp_wall('entr_lamp', (x, -Y0 - 0.02, 1.9), face='y-'))
    # windows (lit) with white frames + snowy sills
    for k, (x, z0, z1, w) in enumerate(WIN_Y):
        objs.append(T.win('fwin%d' % k, (x, -Y0, z1 - 0.02), face='y-', w=w - 0.06, h=z1 - z0 - 0.06,
                          frame=TRIM, cross=True, seed=k))
    # name board (blank: the game writes '물류센터') + emblem bracket sign at the corner
    bx0, bx1, bz0, bz1 = -3.0, 0.1, 2.75, 3.6
    bd = [box('board_fr', (bx1 - bx0 + 0.12, 0.1, bz1 - bz0 + 0.12), ((bx0 + bx1) / 2, -Y0 - 0.06, bz0 - 0.06),
              mat=flat(SIGN_YEL, 0.4), bevel=0.03),
          box('board', (bx1 - bx0 - 0.08, 0.1, bz1 - bz0 - 0.08), ((bx0 + bx1) / 2, -Y0 - 0.1, bz0 + 0.04),
              mat=flat('#FBF6EA', 0.5), bevel=0.02),
          L.snow_slab('board_snow', bx1 - bx0 + 0.05, 0.14, 0.06, ((bx0 + bx1) / 2, -Y0 - 0.06, bz1 + 0.06), seed=8)]
    objs += bd
    POINTS['fx_board'] = wpt((bx0 + bx1) / 2, -Y0 - 0.16, (bz0 + bz1) / 2)
    POINTS['boardSizeM'] = [round(bx1 - bx0 - 0.08, 3), round(bz1 - bz0 - 0.08, 3)]
    objs += T.bracket_sign('corner_sign', (X0, -Y0), out_dir=(1.0, -1.0), z=3.25, arm=0.55, r=0.38,
                           bg='#3D7CC9', rim=SIGN_YEL, emblem=em_parcel, es=0.85)
    # downpipe at the front-right corner
    pm = flat('#C3CCD8', 0.35, 0.5)
    objs.append(cyl('downpipe', 0.06, EAVE - 0.1, (X0 - 0.35, -Y0 - 0.08, 0.1), mat=pm, segs=12, bevel=0.0))
    objs.append(box('downpipe_s', (0.16, 0.22, 0.08), (X0 - 0.35, -Y0 - 0.14, 0.05), mat=pm, bevel=0.02))
    # dock canopies + door frames on the +X facade
    for k, (y0, y1, h) in enumerate((DOCK1, DOCK2)):
        with L.Collect() as c:
            PA.awning(y1 - y0 + 0.5, 0.95, h + 0.75, h + 0.42, 0.0, -0.95, '#F2C230', '#2B2F3A', 10, name='dcan%d' % k,
                      flaps=False)
        g = L.group(BA.top_level(c.objs), 'dcan_g%d' % k, loc=(X0 + 0.02, (y0 + y1) / 2, 0), rot=(0, 0, 90))
        objs += c.objs + [g]
        fr = flat(X.STEEL_D, 0.4, 0.5)
        for y in (y0 - 0.06, y1 + 0.06):
            objs.append(box('djamb%d' % k, (0.14, 0.12, h), (X0 + 0.02, y, 0.0), mat=fr, bevel=0.015))
        objs.append(box('dhead%d' % k, (0.14, y1 - y0 + 0.24, 0.16), (X0 + 0.02, (y0 + y1) / 2, h), mat=fr, bevel=0.02))
        objs.append(box('dbox%d' % k, (0.32, y1 - y0 + 0.1, 0.34), (X0 - TW - 0.16, (y0 + y1) / 2, h - 0.02),
                        mat=flat('#C3CCD8', 0.4, 0.4), bevel=0.04))
    POINTS['fx_dockLights'] = []
    return objs


def dock_doors():
    """Two yellow roll-up doors (separate groups door1 / door2).  set_door(k, f): f = 0 closed .. 5 open."""
    leaves = {}
    for k, (y0, y1, h) in enumerate((DOCK1, DOCK2)):
        nb = L.NB('rollup%d' % k, rough=0.45)
        tc = nb.n('ShaderNodeTexCoord')
        sep = nb.n('ShaderNodeSeparateXYZ')
        nb.link(tc.outputs['Object'], sep.inputs[0])
        v = nb.math('FRACT', nb.math('MULTIPLY', sep.outputs['Z'], 1.0 / 0.16))
        fac = nb.map_range(v, 0.82, 0.92)
        nb.base(nb.mix_rgb(fac, C(DOOR_YEL), hexmix(DOOR_YEL, '#000000', 0.22)))
        leaf = box('door%d_leaf' % k, (0.06, y1 - y0, h), (X0 - TW / 2, (y0 + y1) / 2, 0.0), mat=nb.m, bevel=0.0)
        win = box('door%d_win' % k, (0.07, (y1 - y0) * 0.7, 0.2), (X0 - TW / 2, (y0 + y1) / 2, h * 0.62),
                  mat=T.glow_mat('dwin%d' % k, 1.2), bevel=0.0)
        bot = box('door%d_bot' % k, (0.075, y1 - y0, 0.14), (X0 - TW / 2, (y0 + y1) / 2, 0.0),
                  mat=X.hazard(X.LINE_YEL, X.INK, 5.0, 45.0, ('Y', 'Z')), bevel=0.0)
        hnd = box('door%d_h' % k, (0.08, 0.3, 0.05), (X0 - TW / 2 + 0.03, (y0 + y1) / 2, 0.45), mat=flat(X.INK, 0.4),
                  bevel=0.01)
        parts = [leaf, win, bot, hnd]
        grp = L.group(parts, 'door%d' % k)
        leaves[k] = (grp, h)
        X.tag([grp] + parts, 'door%d' % (k + 1))
    frac = [0.0, 0.2, 0.4, 0.6, 0.8, 0.95]

    def set_door(k, f):
        grp, h = leaves[k]
        grp.location.z = h * frac[max(0, min(5, f))]
    return set_door


# =================================================================================================== props (outside)

def outside_props():
    objs = []
    rub = flat('#2E323C', 0.75)
    for k, (y0, y1, _) in enumerate((DOCK1, DOCK2)):
        for y in (y0 - 0.2, y1 + 0.2):
            objs.append(box('bumper', (0.16, 0.24, 0.32), (X0 + 0.08, y, 0.08), mat=rub, bevel=0.04))
        # wheel stop + bollards at the outer bay corners
        for y in (y0 - 0.22, y1 + 0.22):
            objs.append(cyl('bol', 0.09, 0.85, (X0 + 1.45, y, 0.0), mat=X.hazard(X.LINE_YEL, X.INK, 4.0, 0.0,
                                                                                 ('X', 'Z')),
                            segs=16, bevel=0.03))
            objs.append(sphere('bol_s', 0.1, (X0 + 1.45, y, 0.86), flat('snow_mat', 0.9), scale=(1, 1, 0.55), segs=12,
                               rings=6))
        # dock lamp on a post between door and bollard
        ly = y1 + 0.42 if k == 0 else y0 - 0.42
        objs.append(cyl('dlpost', 0.04, 2.6, (X0 + 0.35, ly, 0), mat=flat(X.INK, 0.5), segs=10, bevel=0.0))
        objs.append(cyl('dlbase', 0.12, 0.08, (X0 + 0.35, ly, 0), mat=flat(X.INK, 0.5), segs=14, bevel=0.01))
        dl = L.emissive('dlamp%d' % k, '#FFE2A0', '#FFD27A', 2.0)
        objs.append(box('dlhead', (0.2, 0.28, 0.14), (X0 + 0.42, ly, 2.55), mat=flat(X.LINE_YEL, 0.4), bevel=0.03))
        objs.append(box('dllens', (0.04, 0.2, 0.08), (X0 + 0.53, ly, 2.58), mat=dl, bevel=0.01))
        POINTS['fx_dockLights'].append(wpt(X0 + 0.55, ly, 2.6))
    # bench + bin + mailbox by the entrance
    with L.Collect() as c:
        T.town_bench('bench', (ENTR[1] + 1.3, -Y0 - 0.55, 0), rot_z=0.0)
    objs += c.objs
    objs.append(cyl('obin', 0.2, 0.62, (ENTR[0] - 0.55, -Y0 - 0.45, 0), mat=flat('#3E8E57', 0.5), segs=18,
                    bevel=0.03))
    objs.append(L.snow_slab('obin_s', 0.36, 0.36, 0.06, (ENTR[0] - 0.55, -Y0 - 0.45, 0.62), seed=4))
    # snow piles + a few pallets stacked outside the right corner
    for k, (x, y, r) in enumerate(((X0 + 0.5, -Y0 - 0.35, 0.36), (-X0 + 0.6, -Y0 - 0.3, 0.3),
                                  (X0 + 1.2, Y0 - 0.1, 0.32), (4.2, -Y0 - 0.4, 0.26))):
        objs.append(blob('snowpile%d' % k, r, (x, y, 0.0), flat('snow_mat', 0.9), scale=(1.4, 1.0, 0.55), seed=k + 2,
                         amp=0.2, subdiv=2, flat_bottom=0.5))
    for k in range(3):
        objs.append(X.pallet('opal%d' % k, 0.78, 0.78, 0.12, loc=(X0 + 0.75, -Y0 + 0.75 - 0.0, k * 0.12),
                             rot_z=k * 5))
    objs.append(L.snow_slab('opal_s', 0.7, 0.7, 0.07, (X0 + 0.75, -Y0 + 0.75, 0.36), seed=9))
    # loading-zone post sign (blank) at the apron's front end
    objs += T.post_sign('loadsign', (X0 + 1.15, -Y0 + 0.15, 0.0), h=2.0, r=0.28, bg=X.LINE_YEL, rim=X.INK,
                        emblem=lambda s=1.0: em_forklift_icon(s), es=0.8)
    return objs


def em_forklift_icon(s=1.0):
    """Tiny forklift silhouette emblem (sign frame)."""
    im = flat(X.INK, 0.5)
    box('efk_body', (0.34 * s, 0.05, 0.2 * s), (0.02 * s, -0.04, -0.12 * s), mat=im, bevel=0.01)
    box('efk_cab', (0.2 * s, 0.05, 0.2 * s), (0.06 * s, -0.04, 0.06 * s), mat=im, bevel=0.01)
    box('efk_mast', (0.04 * s, 0.05, 0.42 * s), (-0.17 * s, -0.04, -0.2 * s), mat=im, bevel=0.0)
    box('efk_fork', (0.16 * s, 0.05, 0.03 * s), (-0.26 * s, -0.04, -0.2 * s), mat=im, bevel=0.0)
    for x in (-0.08, 0.14):
        cyl('efk_wh', 0.07 * s, 0.06, (x * s, -0.04, -0.17 * s), rot=(90, 0, 0), mat=im, segs=14, origin='center',
            bevel=0.0)


# =================================================================================================== points

def interaction_points():
    """Staff, customers, forklift path, docks (world metres + facing); lgx_render converts to px and validates the
    depth band of every standing point against the rendered layers."""
    P = POINTS
    P['staff'] = [
        dict(role='clerk', at=wpt(-4.2, -1.55), dir='SW', note='office clerk behind the settlement counter (stamps the '
                                                               'ledger)'),
        dict(role='packer', at=wpt(-0.4, 0.55), dir='SW', note='packer behind the conveyor'),
        dict(role='packer', at=wpt(3.1, 0.68), dir='SW', note='packer behind the packing table'),
        dict(role='picker', at=wpt(-2.9, 2.42), dir='NE', note='picker at the food rack'),
        dict(role='picker', at=wpt(1.7, 2.42), dir='NE', note='picker at the tools rack'),
        dict(role='picker', at=wpt(-3.72, 1.15), dir='NW', note='picker at the furniture rack'),
        dict(role='dockhand', at=wpt(X0 + 0.75, -0.25), dir='SE', note='dock hand on the apron between the two bays '
                                                                        '(outside)'),
    ]
    P['customers'] = [
        dict(at=wpt(-4.2, -2.95), dir='NE', note='at the settlement counter (first in the queue)'),
        dict(at=wpt(-3.35, -3.05), dir='NW'),
        dict(at=wpt(-2.5, -3.15), dir='NW'),
        dict(at=wpt(-1.6, -3.3), dir='NW', note='just inside the door'),
        dict(at=wpt(-1.6, -4.75), dir='NE', note='outside the door'),
        dict(at=wpt(-1.6, -5.55), dir='NE'),
        dict(at=wpt(-1.6, -6.35), dir='NE'),
    ]
    P['doorPoint'] = wpt((ENTR[0] + ENTR[1]) / 2, -Y0 - 0.55)
    P['inside'] = wpt((ENTR[0] + ENTR[1]) / 2, -YI + 0.45)
    # forklift loop: axis-aligned legs; dir = heading the forklift FACES (it may reverse); action at the node
    F = []

    def n(x, y, d, act=None, note=None):
        e = dict(at=wpt(x, y), dir=d)
        if act:
            e['action'] = act
        if note:
            e['note'] = note
        F.append(e)
    n(-2.9, LANE_Y, 'NE', 'pick', 'turn to the food rack, forks in, lift (anim lift), back out')
    n(CORR_X, LANE_Y, 'SE', None, 'drive +X along the lane')
    n(X0 + 0.15, (DOCK2[0] + DOCK2[1]) / 2, 'SE', 'drop', 'through dock 2 to the truck: lift, set the pallet down')
    n(CORR_X, (DOCK2[0] + DOCK2[1]) / 2, 'SE', None, 'reverse back inside (still facing SE)')
    n(CORR_X, (DOCK1[0] + DOCK1[1]) / 2, 'SW', None, 'drive -Y down the dock corridor')
    n(X0 + 0.15, (DOCK1[0] + DOCK1[1]) / 2, 'SE', 'pick', 'through dock 1: pick a pallet from the van')
    n(CORR_X, (DOCK1[0] + DOCK1[1]) / 2, 'SE', None, 'reverse back inside')
    n(CORR_X, LANE_Y, 'NE', None, 'drive +Y up the corridor')
    n(1.7, LANE_Y, 'NW', 'drop', 'back along the lane to the tools rack: put away (lift)')
    n(-2.9, LANE_Y, 'NW', None, 'continue to the food rack -> loop')
    P['forkliftPath'] = F
    P['docks'] = [
        dict(bay=1, door=wpt(X0, (DOCK1[0] + DOCK1[1]) / 2), widthM=round(DOCK1[1] - DOCK1[0], 2), dir='SE',
             suits='delivery_van', note='van bay (front)'),
        dict(bay=2, door=wpt(X0, (DOCK2[0] + DOCK2[1]) / 2), widthM=round(DOCK2[1] - DOCK2[0], 2), dir='SE',
             suits='truck_cargo / moving_truck', note='truck bay (back)'),
    ]


# =================================================================================================== build

def build():
    """Build the whole centre (every object tagged with its group).  Returns the animation setters
    {'belt': set_belt(f), 'door': set_door(k, f), 'lamp': set_lamp(f)} and POINTS."""
    POINTS.clear()
    POINTS['fx_dockLights'] = []
    capm = flat(X.CUT, 0.75)
    with Group('back'):
        back_walls()
    with Group('floor'):
        floor_and_markings()
    with Group('apron'):
        apron()
    with Group('interior'):
        racks()
        interior_decor()
        office_back()
        office_lamp_base()
    # rack FRONT parts (front uprights, front beams, beam tags): group 'rackf' = drawn above the stock, below the
    # pickers / forklift (lgx_pack derives _interior_racks = _interior x the rmask pass)
    for o in bpy.context.scene.objects:
        if o.get('lgx') == 'interior' and '_rf_' in o.name:
            o['lgx'] = 'rackf'
    with Group('front_f'):
        conveyor_static()
        packing_table()
        office_front()
    with Group('lamp'):
        set_lamp = office_lamp_head()
    with Group('belt'):
        _, set_belt = belt_parts()
    with Group('stub'):
        front_walls(STUB_Z, cap=capm, name='stub')
        cut_cap('stubl', STUB_Z)
    with Group('cut'):
        front_walls(CUT_Z, cap=capm, name='cutw')
        cut_cap('cutl', CUT_Z)
    with Group('shell'):
        front_walls(EAVE, cap=None, name='fw')
        roof()
        gables()
        facade_front()
    set_door = dock_doors()
    with Group('props'):
        outside_props()
    interaction_points()
    set_belt(0)
    set_door(0, 0)
    set_door(1, 0)
    set_lamp(0)
    return {'belt': set_belt, 'door': set_door, 'lamp': set_lamp}, POINTS
