"""
town_assets.py - buildings and street props of the neighbour town "솔방울 마을" (docs/CONTRACT_V4.md section K).

Registry TOWN maps a build key to its builder + metadata, in exactly the format of bld_assets.BLD, so the
buildings are rendered by bld_render.render_build() unchanged (same camera / light / PPU / shadow catcher /
markers).  The rails (town_rails.py) and the snow train (town_train.py) have their own drivers.
town_render.py renders everything into /tmp/fv_cache/town, town_pack.py packs assets/town/.

Conventions (same as bld_assets.py)
  * 1 unit = 1 m, world origin = footprint centre = sprite anchor; local front = -Y (screen down-left).
  * Interaction markers use bld_assets.mark(kind, loc, facing) (so bld_render records them):
        door -> doorPoint (+doorDir)     customer -> customerPoints/Dirs     staff -> staffPoints/Dirs
        in -> inPoint (porter delivery)  gather -> gatherPoints/Dirs (school yard line-up, plaza)
        seat -> seatPoints/Dirs          wait -> waitPoints/Dirs (platform, stop)     play -> playPoints/Dirs
        board -> boardPoints (train doors on the platform)
  * Every point a character can stand on is placed in FRONT of the building geometry (it sorts above the
    building when its y > the building's front edge; town_pack also writes footprintPoly so the game can test it).

Not run directly - see town_render.py.
"""
import math
from collections import OrderedDict

import bpy  # noqa: F401
from mathutils import Vector

import prop_lib as L
from prop_lib import C, flat, snowy, tonal, box, cyl, sphere, blob, log, extrude, hexmix
import prop_assets as PA
import life_assets as LA
import bld_assets as BA
import town_lib as T
from bld_assets import mark

TOWN = OrderedDict()


def town(key, kind, atlas, fp=None, yaw=0.0, shadow=True, samples=40, notes='', front='-Y', catcher=24.0, work=0,
         fps=8, sprites=None, extra=None, ko=None, en=None, zone=None, anim_name=None):
    """Register a builder (same spec fields as bld_assets.bld + name/zone metadata for the manifest)."""
    def deco(fn):
        ex = dict(extra or {})
        if ko or en:
            ex['name'] = {'ko': ko or key, 'en': en or key}
        if zone:
            ex['zone'] = zone
        TOWN[key] = dict(key=key, fn=fn, kind=kind, atlas=atlas, fp=fp, yaw=yaw, shadow=shadow, samples=samples,
                         notes=notes, front=front, catcher=catcher, work=work, fps=fps, item=None, sprites=sprites,
                         extra=ex, anim_name=anim_name)
        return fn
    return deco


def iso_px(x, y, z=0.0):
    """World metres (yaw 0 builds) -> px offset from the anchor (bl_common.world_to_pixel maths)."""
    return [int(round((x + y) * 45.2548)), int(round((x - y) * 22.6274 - z * 55.4256))]


def ground_slab(name, x0, x1, y0, y1, col, z=0.0, t=0.035, snow_lo=0.92, bevel=0.03):
    """Thin paved / packed ground area that belongs to a building (yard, terrace, plaza)."""
    return box(name, (x1 - x0, y1 - y0, t), ((x0 + x1) / 2, (y0 + y1) / 2, z), mat=tonal(col, 0.06, 2.5, rough=0.9),
               bevel=bevel)


def tiles_mat(c1, c2, n=6.0):
    """Checker paving (object X/Y), for plazas and yards."""
    key = ('tiles', c1, c2, n)
    if key in L._CUSTOM:
        return L._CUSTOM[key]
    nb = L.NB('tiles_%s' % c1.lstrip('#'), rough=0.85)
    tc = nb.n('ShaderNodeTexCoord')
    ch = nb.n('ShaderNodeTexChecker')
    ch.inputs['Color1'].default_value = nb.rgb(c1)
    ch.inputs['Color2'].default_value = nb.rgb(c2)
    ch.inputs['Scale'].default_value = n
    nb.link(tc.outputs['Object'], ch.inputs['Vector'])
    nb.base(ch.outputs['Color'])
    L._CUSTOM[key] = nb.m
    return nb.m


# =========================================================================== SCHOOL

SCHOOL_NOTE = ('School (6.4 x 4.2 m incl. its yard): two-storey cream schoolhouse on a red-brick plinth with a red '
               'snowy roof, a white belfry with a golden bell and a clock on the ridge, a columned entrance porch '
               '(front = screen down-left). L-shaped sand-coloured yard in front + on the right, white picket fence '
               'with a gate (pencil + apple sign), flag pole, little football goal, snowman. idle = bell at rest; '
               'anims.work / anims.ring = the bell swinging (4-frame loop, morning / home-time bell). gatherPoints = '
               'six line-up spots for pupils in the front yard (facing the building), doorPoint = porch steps, '
               'staffPoints = the teacher in front of the line, fxPoints.bell / clock / flag.')


@town('school', 'building', 'town_civic', fp=(6.4, 4.2), catcher=30.0, work=4, fps=6, notes=SCHOOL_NOTE,
      ko='학교', en='School', zone='education', anim_name='ring')
def b_school():
    BX, BY, W, D = -0.85, 0.85, 4.2, 2.2          # main block centre + size
    x0, x1, y0, y1 = BX - W / 2, BX + W / 2, BY - D / 2, BY + D / 2
    PL = 0.32                                       # plinth height
    ST = 1.45                                       # storey height
    H = PL + 2 * ST                                 # wall top
    cream, trim, red = '#F3E6C8', T.TRIM_WHITE, '#C8473A'
    # --- yard (L shape) + fence
    yard = tonal('#D9C29A', 0.08, 2.2, rough=0.95)
    box('yard1', (6.3, 1.85, 0.04), (0.0, -1.15, 0.0), mat=yard, bevel=0.03)
    box('yard2', (1.9, 2.3, 0.04), (2.2, 0.95, 0.0), mat=yard, bevel=0.03)
    for i, (x, y, r) in enumerate(((-2.6, -1.7, 0.32), (0.9, -1.85, 0.26), (2.9, 1.7, 0.3), (2.0, -0.4, 0.2))):
        LA.snow_drift('yd%d' % i, r, (x, y, 0.02), seed=60 + i, scale=(1.5, 1.0, 0.25))
    # yard court lines (white)
    lm = flat('#FFFFFF', 0.8)
    box('line1', (0.04, 1.9, 0.01), (2.2, 0.95, 0.04), mat=lm, bevel=0.0)
    cyl('circle', 0.42, 0.012, (2.2, 0.95, 0.04), mat=lm, segs=40, bevel=0.0)
    cyl('circle2', 0.38, 0.016, (2.2, 0.95, 0.04), mat=yard, segs=40, bevel=0.0)
    gx0, gx1 = BX - 0.62, BX + 0.62                 # gate gap in the front fence
    T.picket_fence('fenceF1', (-3.15, -2.05), (gx0, -2.05), seed=1)
    T.picket_fence('fenceF2', (gx1, -2.05), (3.15, -2.05), seed=2)
    T.picket_fence('fenceR', (3.15, -2.05), (3.15, 2.05), seed=3)
    T.picket_fence('fenceL', (-3.15, -2.05), (-3.15, -0.35), seed=4)
    for x in (gx0, gx1):
        box('gpost', (0.18, 0.18, 0.95), (x, -2.05, 0), mat=flat('#F4F1EA', 0.7), bevel=0.03)
        PA.snow_cap('gps', 0.1, (x, -2.05, 0.96), 0.05, 3)
    T.post_sign('gsign', (gx1 + 0.02, -2.05, 0.95), h=1.2, r=0.34, bg='#3D7CC9', rim='#F2C14E',
                emblem=T.em_pencil_apple, es=0.78, post_col='#F4F1EA')
    # --- building
    T.plinth('plinth', W, D, h=PL, col='#B4593F', x=BX, y=BY)
    box('plinthb', (W + 0.12, D + 0.12, PL), (BX, BY, 0), mat=L.brick('#B4593F', '#9C4A35', '#D9CFC2', scale=3.2,
                                                                       row_h=0.4, snow_top=True), bevel=0.03)
    box('walls', (W, D, H - PL), (BX, BY, PL), mat=T.plaster(cream), bevel=0.04)
    T.corner_trims('ctrim', W, D, PL, H - PL, trim, x=BX, y=BY)
    T.band('band1', W, D, PL + ST - 0.05, trim, h=0.1, x=BX, y=BY, snow=True, seed=4)
    T.band('cornice', W, D, H - 0.12, trim, h=0.14, out=0.07, x=BX, y=BY)
    ridge = H + 1.3
    T.gable('roof', W, D, H, ridge, 0.34, red, T.plaster(cream), seed=11, x=BX, y=BY)
    # windows: front (y-) both floors, right side (x+)
    xs = [x0 + 0.5, x0 + 1.15, BX + 0.95, BX + 1.62]
    for k, x in enumerate(xs):
        T.win('wf1_%d' % k, (x, y0, PL + 1.15), 'y-', w=0.5, h=0.62, shutters='#3D7CC9', seed=k)
        T.win('wf2_%d' % k, (x, y0, PL + ST + 1.15), 'y-', w=0.5, h=0.62, shutters='#3D7CC9', seed=10 + k)
    T.win('wfc', (BX, y0, PL + ST + 1.12), 'y-', w=0.44, round_=True, seed=20)
    for k, y in enumerate((BY - 0.45, BY + 0.5)):
        T.win('ws1_%d' % k, (x1, y, PL + 1.15), 'x+', w=0.5, h=0.62, shutters='#3D7CC9', seed=30 + k)
        T.win('ws2_%d' % k, (x1, y, PL + ST + 1.15), 'x+', w=0.5, h=0.62, shutters='#3D7CC9', seed=40 + k)
    # --- entrance porch: double door, two columns, pediment, steps
    T.door('door', (BX, y0, PL), 'y-', w=0.92, h=1.32, col='#3D7CC9', double=True, step=False)
    pz = PL + 1.62
    for sx in (-1, 1):
        cyl('col', 0.09, pz - PL, (BX + sx * 0.62, y0 - 0.72, PL), mat=flat('#FBF8F2', 0.6), segs=16, bevel=0.02)
        box('colbase', (0.26, 0.26, 0.1), (BX + sx * 0.62, y0 - 0.72, PL), mat=flat('#FBF8F2', 0.6), bevel=0.02)
    box('porchfloor', (1.6, 0.9, PL), (BX, y0 - 0.42, 0.0), mat=snowy('#C9CED6', lo=0.65, hi=0.85), bevel=0.03)
    for k in range(2):
        box('step', (1.4, 0.26, PL * (1 - 0.5 * k)), (BX, y0 - 0.98 - 0.22 * (1 - k), 0.0),
            mat=snowy('#C9CED6', lo=0.6, hi=0.8), bevel=0.03)
    box('entab', (1.62, 0.92, 0.14), (BX, y0 - 0.42, pz), mat=flat('#FBF8F2', 0.6), bevel=0.03)
    T.gable('ped', 1.5, 0.95, pz + 0.12, pz + 0.68, 0.12, red, T.plaster('#FBF8F2'), seed=13, x=BX, y=y0 - 0.42,
            along='y', snow_frac=(0.75, 0.75))
    T.lamp_wall('plamp1', (BX - 0.72, y0, PL + 1.5), 'y-')
    # --- belfry + clock on the ridge
    bz = ridge - 0.45
    box('bbase', (0.9, 0.9, 0.95), (BX, BY, bz), mat=T.plaster('#FBF8F2'), bevel=0.03)
    T.band('bband', 0.9, 0.9, bz + 0.9, trim, h=0.08, out=0.05, x=BX, y=BY)
    with L.Collect() as cc:
        T.em_clock(0.95)
    L.group(BA.top_level(cc.objs), 'clock', loc=(BX, BY - 0.47, bz + 0.48))
    tz = bz + 0.98
    PH = 1.12                                       # open belfry height
    for sx in (-1, 1):
        for sy in (-1, 1):
            box('bpost', (0.13, 0.13, PH), (BX + sx * 0.37, BY + sy * 0.37, tz), mat=flat('#FBF8F2', 0.6),
                bevel=0.03)
    box('bfloor', (0.86, 0.86, 0.06), (BX, BY, tz), mat=flat('#E7DFD2', 0.7), bevel=0.02)
    box('btop', (0.96, 0.96, 0.1), (BX, BY, tz + PH), mat=flat('#FBF8F2', 0.6), bevel=0.03)
    T.hip_cap('broof', 1.18, 1.18, tz + PH + 0.08, 0.72, red, seed=14, x=BX, y=BY)
    cyl('vane', 0.025, 0.42, (BX, BY, tz + PH + 0.72), mat=flat('#3D424C', 0.4, 0.6), segs=8)
    with L.Collect() as pc:
        T.em_pinecone(0.42)
    L.group(BA.top_level(pc.objs), 'finial', loc=(BX, BY, tz + PH + 1.2))
    with L.Collect() as bc_:
        T.bell_model('bell', s=1.55)
    bell = L.group(BA.top_level(bc_.objs), 'bellg', loc=(BX, BY, tz + PH - 0.08))
    box('bbeam', (0.86, 0.08, 0.08), (BX, BY, tz + PH - 0.1), mat=flat('#8A5A33', 0.8), bevel=0.01)
    L.point_light('bglow', (BX + 0.25, BY - 0.25, tz + 0.4), 'window', 6.0, 0.1)
    # chimney on the back slope
    _, smoke = T.chimney('chim', x0 + 0.7, BY + 0.6, H - 0.2, ridge + 0.1, col='#B4593F')
    # --- yard furniture: flag pole, football goal, snowman, ball, bench
    cyl('fpole', 0.04, 3.2, (2.75, -1.55, 0), mat=flat('#E3E9F0', 0.3, 0.6), segs=10)
    cyl('fbase', 0.16, 0.14, (2.75, -1.55, 0), mat=snowy('stone', lo=0.6, hi=0.8), segs=14, r_top=0.12)
    sphere('ftop', 0.06, (2.75, -1.55, 3.22), flat('gold', 0.3, 0.8), segs=10, rings=6)
    PA.flag('flag', (2.77, -1.55, 3.12), 0.7, 0.44, '#3D7CC9', seed=4, emblem=True)
    # rainbow climbing arch (colourful school-yard read)
    gx, gy = 2.25, 1.05
    cols = ['#D9483B', '#F08A3A', '#F2C14E', '#5CB85C', '#3D7CC9', '#8E6CC9']
    mb = L.MB()
    for k, col in enumerate(cols):
        y = gy - 0.6 + 0.24 * k
        R = 0.62
        pts = [Vector((gx + R * math.cos(t), y, R * math.sin(t))) for t in [math.pi * j / 12 for j in range(13)]]
        for a_, b_ in zip(pts, pts[1:]):
            mb.seg(a_, b_, 0.035, flat(col, 0.45), segs=8)
    for t in [math.pi * j / 6 for j in range(1, 6)]:
        p0 = Vector((gx + 0.62 * math.cos(t), gy - 0.6, 0.62 * math.sin(t)))
        mb.seg(p0, p0 + Vector((0, 1.2, 0)), 0.025, flat('#E3E9F0', 0.3, 0.6), segs=8)
    mb.done('climber')
    for x in (gx - 0.62, gx + 0.62):
        PA.snow_cap('clsnow', 0.12, (x, gy, 0.03), 0.05, 5, scale=(1.0, 4.0, 1.0))
    sphere('ball', 0.12, (1.95, 0.55, 0.12), flat('#F4F1EA', 0.5), segs=16, rings=10)
    sphere('ballp', 0.05, (1.9, 0.47, 0.18), flat('#2B2F3A', 0.5), segs=8, rings=6)
    with L.Collect() as sc_:
        LA.snowball('sm1', 0.26, (0, 0, 0.24), seed=3)
        LA.snowball('sm2', 0.19, (0, 0, 0.6), seed=4)
        LA.snowball('sm3', 0.15, (0, 0, 0.88), seed=5)
        cyl('smnose', 0.025, 0.12, (0.03, -0.14, 0.88), rot=(90, 0, 20), mat=flat('#F08A3A', 0.5), segs=8, r_top=0.0)
        for sx in (-1, 1):
            sphere('smeye', 0.022, (sx * 0.05, -0.13, 0.94), flat('#241C18', 0.4), segs=8, rings=6)
        cyl('smhat', 0.11, 0.14, (0, 0, 1.0), mat=flat('#D9483B', 0.6), segs=14, r_top=0.08)
    L.group(BA.top_level(sc_.objs), 'snowman', loc=(-2.65, -1.55, 0.02))
    T.town_bench('ybench', (-2.35, -0.72, 0.02), rot_z=0.0)
    T.flower_tub('tub1', (BX - 0.95, y0 - 1.1, 0.0), r=0.2, evergreen=True, seed=3)
    T.flower_tub('tub2', (BX + 0.95, y0 - 1.1, 0.0), r=0.2, evergreen=True, seed=4)
    # --- markers
    mark('door', (BX, y0 - 1.55, 0.0), facing=(0, 1, 0))
    for k in range(6):
        row, col_ = divmod(k, 3)
        mark('gather', (0.0 + 0.55 * col_ + 0.25 * row, -1.15 - 0.45 * row, 0.0), facing=(-0.3, 1, 0))
    mark('staff', (-0.3, -0.85, 0.0), facing=(0.6, -1, 0))
    mark('play', (2.25, 0.35, 0.0), facing=(1, 0.3, 0))
    mark('play', (2.0, 1.35, 0.0), facing=(1, -0.2, 0))

    def idle():
        bell.rotation_euler.x = 0.0

    def work(i):
        bell.rotation_euler.x = math.radians([0.0, 28.0, 0.0, -28.0][i])
        bell.rotation_euler.y = math.radians([0.0, 4.0, 0.0, -4.0][i])

    idle()
    return {'idle': idle, 'work': work,
            'fx': {'bell': (BX, BY, tz + 0.6), 'clock': (BX, BY - 0.5, bz + 0.48), 'flag': (3.1, -1.55, 2.9),
                   'smoke': smoke}}


# =========================================================================== SHOPS (shared shop-house shell)

def shop_house(W=2.6, D=2.4, col='#9ED9C6', trim=T.TRIM_WHITE, roof='#3E7F55', roof_along='y', storeys=2, ST=1.45,
               PL=0.18, x=0.0, y=0.25, seed=0, side_windows=True, shutters=None, upper_round=True, chimney=None,
               wall_mat=None, upper_windows=None):
    """Two-storey shop house: plinth, plaster walls, trims, band, gable roof (gable toward the front when
    roof_along='y').  Returns a dict of handy coordinates."""
    x0, x1, y0, y1 = x - W / 2, x + W / 2, y - D / 2, y + D / 2
    H = PL + storeys * ST
    T.plinth('plinth', W, D, h=PL, col='#8E96A3', x=x, y=y)
    box('walls', (W, D, H - PL), (x, y, PL), mat=wall_mat or T.plaster(col), bevel=0.04)
    T.corner_trims('ctrim', W, D, PL, H - PL, trim, x=x, y=y)
    if storeys > 1:
        T.band('band', W, D, PL + ST - 0.04, trim, h=0.09, x=x, y=y, snow=True, seed=seed)
    T.band('cornice', W, D, H - 0.1, trim, h=0.12, out=0.06, x=x, y=y)
    rh = 1.25 if roof_along == 'y' else 1.05
    ridge = H + rh
    if roof:
        T.gable('roof', W, D, H, ridge, 0.3, roof, wall_mat or T.plaster(col), seed=seed + 1, x=x, y=y,
                along=roof_along)
    if storeys > 1:
        uw = upper_windows if upper_windows is not None else [x - W * 0.22, x + W * 0.22]
        for k, wx in enumerate(uw):
            T.win('uw%d' % k, (wx, y0, PL + ST + 1.12), 'y-', w=0.5, h=0.6, shutters=shutters, seed=seed + 20 + k)
        if roof_along == 'y' and upper_round and roof:
            T.win('gw', (x, y0 - 0.1, H + 0.75), 'y-', w=0.4, round_=True, seed=seed + 30)
    if side_windows:
        for k, wy in enumerate((y - D * 0.18,)):
            T.win('sw1_%d' % k, (x1, wy, PL + 1.15), 'x+', w=0.55, h=0.6, shutters=shutters, seed=seed + 40)
            if storeys > 1:
                T.win('sw2_%d' % k, (x1, wy, PL + ST + 1.12), 'x+', w=0.5, h=0.6, shutters=shutters, seed=seed + 41)
    smoke = None
    if chimney:
        _, smoke = T.chimney('chim', x0 + 0.45, y + D * 0.25, H - 0.2, ridge + 0.25, col=chimney)
    return {'x0': x0, 'x1': x1, 'y0': y0, 'y1': y1, 'H': H, 'PL': PL, 'ST': ST, 'ridge': ridge, 'W': W, 'D': D,
            'x': x, 'y': y, 'smoke': smoke}


def shop_marks(S, door_x, cust=2, staff=True, inpt=True):
    """Standard shop markers: door, customers queuing toward the camera-left, a shopkeeper beside the door,
    a delivery pad on the right side."""
    y0, x1 = S['y0'], S['x1']
    mark('door', (door_x, y0 - 0.75, 0.0), facing=(0, 1, 0))
    for k in range(cust):
        mark('customer', (door_x + 0.15 + 0.1 * k, y0 - 1.15 - 0.42 * k, 0.0), facing=(0, 1, 0))
    if staff:
        mark('staff', (door_x + 0.75, y0 - 0.6, 0.0), facing=(-0.5, -1, 0))
    if inpt:
        mark('in', (x1 + 0.75, S['y'] - 0.2, 0.0))


# =========================================================================== CAFE

CAFE_NOTE = ('Cafe (3 x 3 m): mint two-storey shop house, gable toward the street, mint + cream striped awning, '
             'big lit window with cakes and cups, a giant coffee cup on the roof (steam at fxPoints.steam) and a '
             'coffee-cup bracket sign at the front corner; terrace table with two chairs (seatPoints), chalk board, '
             'flower tub. doorPoint = in front of the door, customerPoints = queue, staffPoints = barista greeting '
             'beside the door, inPoint = delivery pad on the right side (bread / fish from the village).')


@town('cafe', 'building', 'town_shops', fp=(3.0, 3.0), notes=CAFE_NOTE, ko='카페', en='Cafe', zone='shops')
def b_cafe():
    S = shop_house(W=2.6, D=2.3, col='#A8DCCB', roof='#C8473A', roof_along='y', seed=50, shutters='#3FA58C',
                   chimney=None)
    x0, x1, y0, PL, ST, H = S['x0'], S['x1'], S['y0'], S['PL'], S['ST'], S['H']
    # shop front: big display window (left) + glazed door (right)
    wood = '#7A4A2A'

    def display(objs):
        for k, x in enumerate((-0.38, 0.0, 0.38)):
            objs.append(box('shelf', (0.3, 0.12, 0.03), (x, -0.1, 0.32), mat=flat('#FFFFFF', 0.5), bevel=0.01))
            objs.append(cyl('cake', 0.1, 0.1, (x, -0.1, 0.35), mat=flat(['#F7C6D9', '#F4E3C3', '#8C5A3C'][k], 0.6),
                            segs=16, bevel=0.02))
            objs.append(cyl('cream', 0.104, 0.025, (x, -0.1, 0.44), mat=flat('#FFFFFF', 0.5), segs=16, bevel=0.01))
            objs.append(sphere('cherry', 0.025, (x, -0.1, 0.48), flat('#D9483B', 0.3), segs=8, rings=6))
            objs.append(cyl('cupd', 0.045, 0.07, (x + 0.08, -0.08, 0.06), mat=flat('#FFFFFF', 0.4), segs=12,
                            r_top=0.055))
    T.shop_window('swin', (x0 + 0.85, y0, PL + 0.25), 'y-', w=1.2, h=0.95, frame_col=wood, display=display,
                  mullions=1)
    T.door('door', (x1 - 0.62, y0, PL), 'y-', w=0.72, h=1.35, col='#3FA58C', frame_col=wood, glass=True,
           step_depth=0.36)
    box('fascia', (S['W'] + 0.1, 0.12, 0.3), (S['x'], y0 - 0.06, PL + 1.5), mat=flat(wood, 0.7), bevel=0.03)
    T.awning_on('y-', S['W'] + 0.2, y0 + 0.02, PL + 1.82, PL + 1.48, 0.62, '#3FA58C', 'cream', 8, x=S['x'],
                name='awn')
    # giant coffee cup on the roof (faces the camera) + bracket sign
    box('cupstand', (0.5, 0.5, 0.12), (S['x'], y0 + 0.2, S['ridge'] + 0.0), mat=flat('#7A4A2A', 0.7), bevel=0.03)
    T.emblem_at('roofcup', lambda s: T.em_coffee(s, cup='#3FA58C', band_col='#F4F1EA'),
                (S['x'], y0 + 0.2, S['ridge'] + 0.12 + 0.27 * 1.45), scale=1.45, tilt=4.0)
    T.bracket_sign('bsign', (x1, y0), z=PL + 2.6, arm=0.55, r=0.4, bg='#3FA58C', rim='#F2C14E',
                   emblem=lambda s: T.em_coffee(s, steam=False), es=0.85)
    T.lamp_wall('lamp', (x0 + 0.25, y0, PL + 1.75), 'y-')
    # terrace: round table + 2 chairs, chalk board, flower tub
    tx, ty = x1 + 0.0, y0 - 1.05
    cyl('tleg', 0.04, 0.68, (tx, ty, 0), mat=flat('#2E3A4A', 0.4, 0.5), segs=10)
    cyl('tfoot', 0.18, 0.04, (tx, ty, 0), mat=flat('#2E3A4A', 0.4, 0.5), segs=16)
    cyl('ttop', 0.34, 0.05, (tx, ty, 0.68), mat=flat('#FFFFFF', 0.5), segs=28, bevel=0.015)
    cyl('tcup', 0.045, 0.07, (tx - 0.08, ty + 0.02, 0.73), mat=flat('#FFFFFF', 0.4), segs=12, r_top=0.055)
    cyl('tcup2', 0.045, 0.07, (tx + 0.1, ty - 0.06, 0.73), mat=flat('#3FA58C', 0.4), segs=12, r_top=0.055)
    PA.snow_cap('tsn', 0.12, (tx + 0.12, ty + 0.12, 0.72), 0.04, 3)
    chairs = []
    for k, (cx, cy, rz) in enumerate(((tx - 0.55, ty + 0.05, -90), (tx + 0.5, ty - 0.1, 90))):
        cm = flat('#3FA58C', 0.5)
        parts = [box('cseat', (0.36, 0.36, 0.05), (0, 0, 0.42), mat=cm, bevel=0.02),
                 box('cback', (0.36, 0.05, 0.42), (0, 0.17, 0.45), mat=cm, bevel=0.02)]
        for lx in (-0.14, 0.14):
            for ly in (-0.14, 0.14):
                parts.append(cyl('cl', 0.02, 0.42, (lx, ly, 0), mat=flat('#2E3A4A', 0.4, 0.5), segs=6))
        L.group(parts, 'chair%d' % k, loc=(cx, cy, 0), rot=(0, 0, rz))
        chairs.append((cx, cy, rz))
    # A-frame chalk board (blank)
    bm_ = flat('#2F3B36', 0.8)
    for s in (-1, 1):
        box('chalk', (0.5, 0.04, 0.7), (x0 + 0.25, y0 - 0.75 + s * 0.08, 0.0), rot=(s * 12, 0, 0), mat=bm_,
            bevel=0.015)
    box('chalkfr', (0.56, 0.2, 0.05), (x0 + 0.25, y0 - 0.75, 0.66), mat=flat(wood, 0.7), bevel=0.015)
    for k in range(3):
        box('chalkline', (0.3 - 0.06 * k, 0.01, 0.03), (x0 + 0.25, y0 - 0.85, 0.48 - 0.12 * k), rot=(12, 0, 0),
            mat=flat(['#F4F1EA', '#F7C6D9', '#A8DCCB'][k], 0.8), bevel=0.0)
    T.flower_tub('tub', (x0 - 0.15, y0 - 0.25, 0.0), r=0.2, seed=5)
    LA.snow_drift('d1', 0.24, (x1 + 0.3, S['y'] + 1.0, 0.0), seed=51)
    # markers
    shop_marks(S, x1 - 0.62)
    for cx, cy, rz in chairs:
        mark('seat', (cx, cy, 0.0), facing=(math.cos(math.radians(rz + 90)) * -1, math.sin(math.radians(rz + 90)) * -1, 0))
    return {'fx': {'steam': (S['x'], y0 + 0.2, S['ridge'] + 1.0), 'sign': (x1 + 0.35, y0 - 0.35, PL + 2.0)}}


# =========================================================================== shop helpers

def rooftop_disc(S, name, emblem, bg, rim='#F2C14E', r=0.52, es=1.0, along='x', dy=0.0, dx=0.0, lift=0.0):
    """A round sign standing on the roof ridge on two little legs, facing the camera."""
    if along == 'x':
        bx, by, bz = S['x'] + dx, S['y'] + dy, S['ridge'] + 0.05 + lift
    else:
        bx, by, bz = S['x'] + dx, S['y0'] + 0.45 + dy, S['ridge'] + 0.05 + lift
    iron = flat('#3D424C', 0.45, 0.6)
    side = Vector((math.cos(math.radians(45)), math.sin(math.radians(45)), 0.0))
    for s in (-1, 1):
        p = Vector((bx, by, bz)) + side * s * r * 0.55
        cyl(name + '_leg', 0.04, 0.42, tuple(p), mat=iron, segs=8)
    return T.sign_disc(name, (bx, by, bz + 0.38 + r), r=r, bg=bg, rim=rim, emblem=emblem, es=es, tilt=8.0)


def false_front(S, name, h=0.9, col='#F3E6C8', trim=T.TRIM_WHITE, step=True, seed=0):
    """Square parapet front above the shop front (like shop_general's false front) with a cornice + snow."""
    W, y0, H, x = S['W'], S['y0'], S['H'], S['x']
    prof = [(-W / 2 - 0.06, 0.0), (W / 2 + 0.06, 0.0), (W / 2 + 0.06, h * 0.7)]
    if step:
        prof += [(W * 0.22, h * 0.7), (W * 0.22, h), (-W * 0.22, h), (-W * 0.22, h * 0.7)]
    prof += [(-W / 2 - 0.06, h * 0.7)]
    m = T.plaster(col)
    ff = extrude(name, prof, 0.16, rot=PA.facing_rot(0), top=m, side=m, bevel=0.03)
    ff.location = (x, y0 + 0.02, H - 0.02)
    box(name + '_c1', (W + 0.3, 0.28, 0.1), (x, y0 + 0.02, H - 0.02 + h * 0.7 - 0.02), mat=flat(trim, 0.75), bevel=0.03)
    L.snow_slab(name + '_s1', W + 0.24, 0.24, 0.07, (x, y0 + 0.02, H + h * 0.7 + 0.07), seed=seed, droop=0.02)
    if step:
        box(name + '_c2', (W * 0.44 + 0.14, 0.26, 0.09), (x, y0 + 0.02, H - 0.02 + h - 0.02), mat=flat(trim, 0.75),
            bevel=0.03)
        L.snow_slab(name + '_s2', W * 0.44, 0.22, 0.06, (x, y0 + 0.02, H + h + 0.06), seed=seed + 1)
    return H + h


def mannequin(objs, x, top='#E8749A', scarf='#F2C14E', y=-0.11, z=0.0, skirt=False):
    stand = flat('#3D424C', 0.45, 0.5)
    objs.append(cyl('mq_base', 0.07, 0.02, (x, y, z), mat=stand, segs=12))
    objs.append(cyl('mq_pole', 0.012, 0.3, (x, y, z), mat=stand, segs=6))
    objs.append(cyl('mq_body', 0.1, 0.3, (x, y, z + 0.3), mat=flat(top, 0.85), r_top=0.12, segs=16, bevel=0.03))
    if skirt:
        objs.append(cyl('mq_skirt', 0.15, 0.14, (x, y, z + 0.18), mat=flat('#3D5A8A', 0.8), r_top=0.1, segs=16,
                        bevel=0.02))
    objs.append(cyl('mq_scarf', 0.085, 0.05, (x, y, z + 0.58), mat=flat(scarf, 0.85), segs=16, bevel=0.02))
    objs.append(sphere('mq_head', 0.075, (x, y, z + 0.7), flat('#F1E6D8', 0.5), segs=14, rings=8))
    objs.append(cyl('mq_hat', 0.07, 0.06, (x, y, z + 0.75), mat=flat(scarf, 0.85), segs=14, r_top=0.03, bevel=0.02))


def book_stack(objs, x, y, z, n=5, seed=0, w=0.24, upright=False):
    rnd = L.rng(seed)
    cols = ['#C0473A', '#3D7CC9', '#3E9A5A', '#F2C14E', '#8E6CC9', '#E8749A', '#5E3A22']
    if upright:
        xx = x - w / 2
        for k in range(n):
            t = rnd.uniform(0.035, 0.06)
            hh = rnd.uniform(0.16, 0.24)
            objs.append(box('bk', (t, 0.12, hh), (xx + t / 2, y, z), mat=flat(cols[(k + seed) % len(cols)], 0.6),
                            bevel=0.008))
            xx += t + 0.004
        return
    zz = z
    for k in range(n):
        t = rnd.uniform(0.035, 0.055)
        objs.append(box('bk', (w * rnd.uniform(0.8, 1.0), 0.14 * rnd.uniform(0.85, 1.0), t), (x + rnd.uniform(-0.02, 0.02),
                                                                                             y, zz),
                        rot=(0, 0, rnd.uniform(-8, 8)), mat=flat(cols[(k + seed) % len(cols)], 0.6), bevel=0.008))
        zz += t


def pole_mat(cols=('#D9483B', '#F4F1EA', '#3D7CC9', '#F4F1EA'), pitch=3.0, starts=2):
    """Barber-pole helix stripes: v = fract(z * pitch + starts * angle / tau) split into len(cols) bands."""
    key = ('pole', cols, pitch, starts)
    if key in L._CUSTOM:
        return L._CUSTOM[key]
    nb = L.NB('barberpole', rough=0.35)
    tc = nb.n('ShaderNodeTexCoord')
    sep = nb.n('ShaderNodeSeparateXYZ')
    nb.link(tc.outputs['Object'], sep.inputs[0])
    ang = nb.n('ShaderNodeMath', operation='ARCTAN2')
    nb.link(sep.outputs['Y'], ang.inputs[0])
    nb.link(sep.outputs['X'], ang.inputs[1])
    a = nb.math('MULTIPLY', ang.outputs[0], starts / math.tau)
    v = nb.math('FRACT', nb.math('ADD', nb.math('MULTIPLY', sep.outputs['Z'], pitch), a))
    col = None
    n = len(cols)
    out = C(cols[0])
    for k in range(1, n):
        f = nb.map_range(v, k / n - 0.01, k / n + 0.01)
        out = nb.mix_rgb(f, out if col is None else col, C(cols[k]))
        col = out
    nb.base(col)
    L._CUSTOM[key] = nb.m
    return nb.m


# =========================================================================== CLOTHING STORE

CLOTH_NOTE = ('Clothing store (3 x 3 m): lilac two-storey shop house with a navy roof, pink + cream awning, a big '
              'window with two mannequins in winter sweaters and scarves, a T-shirt-on-a-hanger sign at the corner '
              'and a big round T-shirt sign on the roof ridge, hat stand + flower tub by the door. Same marker set as '
              'the other shops (doorPoint, customerPoints, staffPoints, inPoint).')


@town('clothing_store', 'building', 'town_shops', fp=(3.0, 3.0), notes=CLOTH_NOTE, ko='옷가게', en='Clothing store',
      zone='shops')
def b_clothing_store():
    S = shop_house(W=2.6, D=2.3, col='#CDBBE6', roof='#3F5F8A', roof_along='x', seed=60, shutters='#8E6CC9')
    x0, x1, y0, PL = S['x0'], S['x1'], S['y0'], S['PL']
    wood = '#5E4A8A'

    def display(objs):
        mannequin(objs, -0.3, top='#E8749A', scarf='#F2C14E')
        mannequin(objs, 0.25, top='#3FA58C', scarf='#D9483B', skirt=True)
        for k, x in enumerate((-0.48, 0.0, 0.46)):
            objs.append(box('fold', (0.16, 0.12, 0.05), (x, -0.14, 0.0), mat=flat(['#F2C14E', '#4E8FD6', '#E8749A'][k],
                                                                                 0.8), bevel=0.015))
    T.shop_window('swin', (x0 + 0.88, y0, PL + 0.2), 'y-', w=1.25, h=1.0, frame_col=wood, display=display, mullions=1,
                  back_col='#FFE8EE')
    T.door('door', (x1 - 0.6, y0, PL), 'y-', w=0.7, h=1.35, col='#8E6CC9', frame_col=wood, step_depth=0.36)
    box('fascia', (S['W'] + 0.1, 0.12, 0.3), (S['x'], y0 - 0.06, PL + 1.5), mat=flat(wood, 0.7), bevel=0.03)
    T.awning_on('y-', S['W'] + 0.2, y0 + 0.02, PL + 1.82, PL + 1.48, 0.62, '#E8749A', 'cream', 8, x=S['x'],
                name='awn')
    rooftop_disc(S, 'rsign', T.em_tshirt, '#F7D9E6', rim='#E8749A', r=0.55, es=1.05, along='x')
    T.bracket_sign('bsign', (x1, y0), z=PL + 2.6, arm=0.55, r=0.38, bg='#8E6CC9', rim='#F2C14E', emblem=T.em_tshirt,
                   es=0.8)
    # hat stand by the door
    hx, hy = x1 + 0.35, y0 - 0.55
    cyl('hpole', 0.025, 1.3, (hx, hy, 0), mat=flat('#8A5A33', 0.7), segs=8)
    cyl('hfoot', 0.18, 0.04, (hx, hy, 0), mat=flat('#8A5A33', 0.7), segs=14)
    for k, (a, col) in enumerate(((0, '#D9483B'), (120, '#F2C14E'), (240, '#3D7CC9'))):
        d = Vector((math.cos(math.radians(a)), math.sin(math.radians(a)), 0)) * 0.13
        cyl('hat', 0.1, 0.1, (hx + d.x, hy + d.y, 1.05 + 0.08 * k), mat=flat(col, 0.85), segs=14, r_top=0.07,
            bevel=0.03)
        sphere('pom', 0.04, (hx + d.x, hy + d.y, 1.17 + 0.08 * k), flat('#F4F1EA', 0.9), segs=10, rings=6)
    T.flower_tub('tub', (x0 - 0.12, y0 - 0.3, 0.0), r=0.2, flowers=('#E8749A', '#F4F1EA', '#8E6CC9'), seed=6)
    LA.snow_drift('d1', 0.24, (x1 + 0.35, S['y'] + 0.9, 0.0), seed=61)
    shop_marks(S, x1 - 0.6)
    return {'fx': {'sign': (S['x'], S['y'], S['ridge'] + 1.0)}}


# =========================================================================== HAIR SALON

SALON_NOTE = ('Hair salon (3 x 3 m): sky-blue shop house with a white trim and a coral gable roof, a spinning '
              'red-white-blue barber pole by the door (anims.work / anims.spin: 4-frame loop), a window with a salon '
              'chair + round mirror, scissors + comb bracket sign and a big scissors sign on the roof. Shop markers '
              'as the other shops.')


@town('hair_salon', 'building', 'town_shops', fp=(3.0, 3.0), notes=SALON_NOTE, ko='미용실', en='Hair salon',
      zone='shops', work=4, fps=8, anim_name='spin')
def b_hair_salon():
    S = shop_house(W=2.5, D=2.3, col='#BFE0F2', roof='#E06A5A', roof_along='y', seed=70, shutters='#3D7CC9')
    x0, x1, y0, PL = S['x0'], S['x1'], S['y0'], S['PL']
    wood = '#2E4F8A'

    def display(objs):
        objs.append(cyl('mirror', 0.24, 0.03, (-0.15, -0.035, 0.58), rot=(90, 0, 0), mat=flat('#DDEFF9', 0.05, 0.6),
                        segs=24, origin='center'))
        objs.append(cyl('mirrorfr', 0.27, 0.025, (-0.15, -0.03, 0.58), rot=(90, 0, 0), mat=flat('#F2C14E', 0.3, 0.7),
                        segs=24, origin='center'))
        objs.append(cyl('chairbase', 0.08, 0.2, (-0.15, -0.12, 0.0), mat=flat('#B9C2CE', 0.3, 0.7), segs=12))
        objs.append(box('chairseat', (0.3, 0.12, 0.08), (-0.15, -0.12, 0.2), mat=flat('#D9483B', 0.5), bevel=0.03))
        objs.append(box('chairback', (0.3, 0.05, 0.32), (-0.15, -0.07, 0.26), mat=flat('#D9483B', 0.5), bevel=0.03))
        for k in range(3):
            objs.append(cyl('bottle', 0.025, 0.1, (0.3 + 0.07 * k, -0.1, 0.0), mat=flat(['#E8749A', '#4E8FD6',
                                                                                     '#F2C14E'][k], 0.3), segs=10))
    T.shop_window('swin', (x0 + 0.85, y0, PL + 0.22), 'y-', w=1.2, h=1.0, frame_col=wood, display=display, mullions=0,
                  back_col='#EAF6FF')
    T.door('door', (x1 - 0.58, y0, PL), 'y-', w=0.68, h=1.35, col='#E06A5A', frame_col=wood, step_depth=0.36)
    box('fascia', (S['W'] + 0.1, 0.12, 0.3), (S['x'], y0 - 0.06, PL + 1.5), mat=flat(wood, 0.7), bevel=0.03)
    T.awning_on('y-', S['W'] + 0.2, y0 + 0.02, PL + 1.82, PL + 1.48, 0.6, '#3D7CC9', 'cream', 8, x=S['x'], name='awn')
    rooftop_disc(S, 'rsign', lambda s: T.em_scissors(s), '#EAF6FF', rim='#E06A5A', r=0.52, es=1.0, along='y')
    T.bracket_sign('bsign', (x1, y0), z=PL + 2.6, arm=0.55, r=0.38, bg='#3D7CC9', rim='#F2C14E',
                   emblem=lambda s: T.em_scissors(s, handle='#F2C14E'), es=0.8)
    # barber pole on a wall bracket left of the door (rotates in the work loop)
    px, py, pz = x1 - 1.08, y0 - 0.2, PL + 0.75
    box('pbr', (0.08, 0.24, 0.06), (px, y0 - 0.1, pz + 0.28), mat=flat('#B9C2CE', 0.3, 0.7), bevel=0.01)
    box('pbr2', (0.08, 0.24, 0.06), (px, y0 - 0.1, pz - 0.06), mat=flat('#B9C2CE', 0.3, 0.7), bevel=0.01)
    pole = cyl('pole', 0.09, 0.62, (px, py, pz - 0.31), mat=pole_mat(), segs=28, origin='center', bevel=0.0)
    for z in (pz - 0.34, pz + 0.31):
        cyl('pcap', 0.11, 0.06, (px, py, z), mat=flat('#E3E9F0', 0.25, 0.7), segs=20, bevel=0.015)
    sphere('ptop', 0.08, (px, py, pz + 0.42), flat('#E3E9F0', 0.25, 0.7), segs=16, rings=8)
    T.flower_tub('tub', (x0 - 0.12, y0 - 0.3, 0.0), r=0.2, flowers=('#3D7CC9', '#F4F1EA', '#E06A5A'), seed=7)
    LA.snow_drift('d1', 0.22, (x1 + 0.3, S['y'] + 1.0, 0.0), seed=71)
    shop_marks(S, x1 - 0.58)

    def idle():
        pole.rotation_euler.z = 0.0

    def work(i):
        pole.rotation_euler.z = math.radians(-45.0 * i)
    idle()
    return {'idle': idle, 'work': work, 'fx': {'pole': (px, py, pz)}}


# =========================================================================== FLOWER SHOP

FLOWER_NOTE = ('Flower shop (3 x 3 m): butter-yellow shop house with a green roof, a little glass lean-to greenhouse '
               'on the right side, tiered flower stand + buckets of tulips / daisies out front, flower boxes, a daisy '
               'bracket sign and a big 3D flower on the roof. staffPoints = florist at the flower stand.')


@town('flower_shop', 'building', 'town_shops', fp=(3.0, 3.0), notes=FLOWER_NOTE, ko='꽃집', en='Flower shop',
      zone='shops')
def b_flower_shop():
    S = shop_house(W=2.4, D=2.2, col='#F6E3A0', roof='#3E8E57', roof_along='x', seed=80, shutters='#3E8E57',
                   side_windows=False, x=-0.25)
    x0, x1, y0, PL = S['x0'], S['x1'], S['y0'], S['PL']
    wood = '#2E6B4F'

    def display(objs):
        for k, x in enumerate((-0.4, -0.12, 0.16, 0.42)):
            objs.append(cyl('pot', 0.07, 0.1, (x, -0.1, 0.0), mat=flat('#B4593F', 0.7), r_top=0.085, segs=12))
            objs.append(sphere('bush', 0.09, (x, -0.1, 0.15), flat('#3E7F55', 0.8), segs=12, rings=8))
            for j in range(3):
                objs.append(sphere('bl', 0.035, (x - 0.04 + 0.04 * j, -0.13, 0.2 + 0.02 * (j % 2)),
                                   flat(['#E8524A', '#F28DB2', '#F2C14E', '#8E6CC9'][k], 0.5), segs=8, rings=6))
    T.shop_window('swin', (x0 + 0.8, y0, PL + 0.25), 'y-', w=1.1, h=0.95, frame_col=wood, display=display, mullions=1,
                  back_col='#FFF6D8')
    T.door('door', (x1 - 0.52, y0, PL), 'y-', w=0.66, h=1.35, col='#3E8E57', frame_col=wood, step_depth=0.34)
    T.awning_on('y-', S['W'] + 0.2, y0 + 0.02, PL + 1.82, PL + 1.48, 0.58, '#3E8E57', 'cream', 8, x=S['x'], name='awn')
    T.emblem_at('roofflower', lambda s: T.em_flower(s, petal='#F28DB2'), (S['x'], S['y'], S['ridge'] + 0.7),
                scale=1.75, tilt=6.0)
    T.bracket_sign('bsign', (x1, y0), z=PL + 2.55, arm=0.5, r=0.36, bg='#3E8E57', rim='#F2C14E',
                   emblem=lambda s: T.em_flower(s, petal='#F4F1EA', center='#F2C14E'), es=0.85)
    # greenhouse lean-to on the +X side
    gx0, gx1, gy0, gy1 = x1, x1 + 0.85, S['y'] - 0.9, S['y'] + 0.9
    glass = L.emissive('ghglass', '#7FC4AE', '#BFF2DC', 0.45, rough=0.15)
    fr = flat('#F4F1EA', 0.6)
    box('ghbase', (gx1 - gx0, gy1 - gy0, 0.3), ((gx0 + gx1) / 2, (gy0 + gy1) / 2, 0), mat=snowy('stone', lo=0.6, hi=0.8),
        bevel=0.03)
    box('ghglass', (gx1 - gx0 - 0.06, gy1 - gy0 - 0.06, 1.1), ((gx0 + gx1) / 2, (gy0 + gy1) / 2, 0.3), mat=glass,
        bevel=0.02)
    for k in range(5):
        y = gy0 + (gy1 - gy0) * k / 4
        box('ghpost', (0.06, 0.06, 1.12), (gx1 - 0.01, y, 0.3), mat=fr, bevel=0.01)
    for z in (0.3, 0.85, 1.38):
        box('ghrail', (0.06, gy1 - gy0, 0.05), (gx1 - 0.01, (gy0 + gy1) / 2, z), mat=fr, bevel=0.01)
    for x in (gx0 + 0.3, gx0 + 0.6):
        box('ghpost2', (0.05, 0.06, 1.1), (x, gy0 + 0.0, 0.3), mat=fr, bevel=0.01)
    with L.Collect() as gc:
        LA.roof('ghroof', gy1 - gy0 + 0.1, gx1 + 0.1, 1.38, gx0, 1.75, 0.04, glass, snow_frac=0.3, seed=8)
    BA.regroup(gc.objs, 'ghr', loc=(0, (gy0 + gy1) / 2, 0), rot=(0, 0, -90))
    for k in range(5):
        cyl('ghpot', 0.11, 0.16, (gx1 + 0.18, gy0 + 0.2 + 0.36 * k, 0), mat=flat('#B4593F', 0.7), r_top=0.13, segs=12)
        sphere('ghplant', 0.14, (gx1 + 0.18, gy0 + 0.2 + 0.36 * k, 0.28), flat('#3E9A5A', 0.8), segs=12, rings=8)
        sphere('ghbloom', 0.06, (gx1 + 0.22, gy0 + 0.16 + 0.36 * k, 0.4), flat(['#E8524A', '#F28DB2', '#F2C14E'][k % 3],
                                                                                0.5), segs=8, rings=6)
    # tiered flower stand + buckets
    sx, sy = S['x'] - 0.1, y0 - 0.85
    for k in range(3):
        box('tier', (1.3 - 0.25 * k, 0.32, 0.06), (sx, sy + 0.18 * k, 0.25 + 0.25 * k), mat=flat('#C98F55', 0.7),
            bevel=0.02)
        for j in range(4 - k):
            bx = sx - (0.45 - 0.12 * k) + 0.3 * j
            cyl('bucket', 0.09, 0.14, (bx, sy + 0.18 * k, 0.31 + 0.25 * k), mat=flat('#B9C2CE', 0.3, 0.6), segs=12,
                r_top=0.1)
            col = ['#E8524A', '#F28DB2', '#F2C14E', '#8E6CC9', '#F4F1EA'][(j + k) % 5]
            for q in range(4):
                a = q * 1.6
                sphere('fb', 0.05, (bx + 0.05 * math.cos(a), sy + 0.18 * k + 0.05 * math.sin(a), 0.5 + 0.25 * k),
                       flat(col, 0.5), segs=8, rings=6)
            sphere('fl', 0.08, (bx, sy + 0.18 * k, 0.45 + 0.25 * k), flat('#3E7F55', 0.8), scale=(1, 1, 0.7), segs=10,
                   rings=6)
    for lx in (-0.6, 0.6):
        box('tleg', (0.05, 0.6, 0.05), (sx + lx, sy + 0.18, 0.28), rot=(-30, 0, 0), mat=flat('#8A5A33', 0.7),
            bevel=0.01, origin='center')
    T.flower_tub('tub', (x0 - 0.15, y0 - 0.25, 0.0), r=0.2, evergreen=True, seed=8)
    LA.snow_drift('d1', 0.22, (gx1 + 0.2, gy1 + 0.2, 0.0), seed=81)
    shop_marks(S, x1 - 0.52, staff=False)
    mark('staff', (sx + 0.85, sy - 0.15, 0.0), facing=(-0.6, -1, 0))
    return {'fx': {'sign': (S['x'], S['y'], S['ridge'] + 1.2)}}


# =========================================================================== BOOKSTORE

BOOK_NOTE = ('Bookstore (3 x 3 m): red-brick shop house with a slate roof and dark green wood shop front, a bay '
             'window stacked with colourful books, an open-book bracket sign + a big open-book sign on the roof, a '
             'book cart and a reading bench outside. Shop markers as the other shops.')


@town('bookstore', 'building', 'town_shops', fp=(3.0, 3.0), notes=BOOK_NOTE, ko='서점', en='Bookstore', zone='shops')
def b_bookstore():
    brick = L.brick('#B5634A', '#9C5240', '#E3D6C6', scale=3.0, row_h=0.4, snow_top=False)
    S = shop_house(W=2.6, D=2.3, col='#B5634A', roof='#4A5568', roof_along='x', seed=90, shutters='#2E5E40',
                   wall_mat=brick, chimney='#8E6A5A')
    x0, x1, y0, PL = S['x0'], S['x1'], S['y0'], S['PL']
    wood = '#2E5E40'

    def display(objs):
        book_stack(objs, -0.42, -0.12, 0.0, n=6, seed=1)
        book_stack(objs, -0.15, -0.12, 0.0, n=4, seed=2, upright=True, w=0.24)
        book_stack(objs, 0.15, -0.12, 0.0, n=5, seed=3)
        book_stack(objs, 0.42, -0.12, 0.0, n=4, seed=4, upright=True, w=0.2)
        objs.append(box('shelf', (1.2, 0.14, 0.03), (0, -0.1, 0.48), mat=flat('#8A5A33', 0.7), bevel=0.01))
        book_stack(objs, -0.3, -0.1, 0.51, n=7, seed=5, upright=True, w=0.36)
        book_stack(objs, 0.2, -0.1, 0.51, n=6, seed=6, upright=True, w=0.32)
    T.shop_window('swin', (x0 + 0.88, y0, PL + 0.22), 'y-', w=1.25, h=1.0, frame_col=wood, display=display, mullions=2,
                  depth=0.26)
    T.door('door', (x1 - 0.6, y0, PL), 'y-', w=0.7, h=1.38, col=wood, frame_col='#F2EEE6', step_depth=0.36)
    box('fascia', (S['W'] + 0.1, 0.14, 0.32), (S['x'], y0 - 0.07, PL + 1.48), mat=flat(wood, 0.6), bevel=0.03)
    box('fasciagold', (S['W'] - 0.2, 0.02, 0.04), (S['x'], y0 - 0.145, PL + 1.62), mat=flat('#F2C14E', 0.3, 0.7),
        bevel=0.0)
    rooftop_disc(S, 'rsign', T.em_book, '#FBF6EA', rim='#2E5E40', r=0.55, es=1.0, along='x')
    T.bracket_sign('bsign', (x1, y0), z=PL + 2.6, arm=0.55, r=0.38, bg=wood, rim='#F2C14E', emblem=T.em_book, es=0.8)
    T.lamp_wall('lamp', (x0 + 0.22, y0, PL + 1.75), 'y-')
    # book cart + bench
    cx, cy = x1 + 0.2, y0 - 0.8
    box('cart', (0.7, 0.4, 0.4), (cx, cy, 0.28), mat=flat('#8A5A33', 0.7), bevel=0.03)
    for wx in (-0.25, 0.25):
        cyl('cwheel', 0.12, 0.05, (cx + wx, cy - 0.22, 0.12), rot=(90, 0, 0), mat=flat('#3D424C', 0.5), segs=14,
            origin='center')
    objs = []
    book_stack(objs, cx - 0.15, cy, 0.68, n=6, seed=8, upright=True, w=0.3)
    book_stack(objs, cx + 0.18, cy, 0.68, n=3, seed=9)
    T.town_bench('bench', (x0 + 0.3, y0 - 0.9, 0.0), rot_z=0.0, col='#8A5A33')
    LA.snow_drift('d1', 0.22, (x1 + 0.35, S['y'] + 0.9, 0.0), seed=91)
    shop_marks(S, x1 - 0.6)
    mark('seat', (x0 + 0.1, y0 - 0.9, 0.0), facing=(0, -1, 0))
    mark('seat', (x0 + 0.6, y0 - 0.9, 0.0), facing=(0, -1, 0))
    return {'fx': {'smoke': S['smoke'], 'sign': (S['x'], S['y'], S['ridge'] + 1.2)}}


# =========================================================================== TOY SHOP

TOY_NOTE = ('Toy shop (3 x 3 m): sunny-yellow shop house with red trim and a red-and-white striped roof, round '
            'windows, a window full of toys (rocking horse, blocks, a ball), a big 3D teddy-bear head on the roof, '
            'a teddy bracket sign with three balloons, a giant gift box by the door. Shop markers as the other shops.')


@town('toy_shop', 'building', 'town_shops', fp=(3.0, 3.0), notes=TOY_NOTE, ko='장난감 가게', en='Toy shop',
      zone='shops')
def b_toy_shop():
    S = shop_house(W=2.5, D=2.3, col='#F6D46A', roof='#D9483B', roof_along='y', seed=100, shutters='#D9483B',
                   upper_round=False, upper_windows=[])
    x0, x1, y0, PL, ST = S['x0'], S['x1'], S['y0'], S['PL'], S['ST']
    wood = '#C0392B'
    for k, wx in enumerate((S['x'] - 0.55, S['x'] + 0.55)):
        T.win('ruw%d' % k, (wx, y0, PL + ST + 1.15), 'y-', w=0.5, round_=True, seed=100 + k)

    def display(objs):
        # rocking horse
        objs.append(box('rh_body', (0.3, 0.1, 0.14), (-0.3, -0.12, 0.2), mat=flat('#F4F1EA', 0.6), bevel=0.04))
        objs.append(sphere('rh_head', 0.08, (-0.14, -0.12, 0.38), flat('#F4F1EA', 0.6), scale=(1.2, 0.8, 1), segs=12,
                           rings=8))
        objs.append(box('rh_mane', (0.04, 0.06, 0.14), (-0.18, -0.12, 0.34), mat=flat('#D9483B', 0.6), bevel=0.01))
        objs.append(box('rh_rock', (0.5, 0.08, 0.04), (-0.3, -0.12, 0.02), mat=flat('#D9483B', 0.6), bevel=0.02))
        for lx in (-0.42, -0.18):
            objs.append(box('rh_leg', (0.04, 0.04, 0.16), (lx, -0.12, 0.05), mat=flat('#F4F1EA', 0.6), bevel=0.01))
        # blocks + ball + little teddy
        for k, (bx, bz, col) in enumerate(((0.05, 0.0, '#3D7CC9'), (0.17, 0.0, '#F2C14E'), (0.11, 0.11, '#3E9A5A'))):
            objs.append(box('blk', (0.1, 0.1, 0.1), (bx, -0.12, bz), mat=flat(col, 0.5), bevel=0.015))
        objs.append(sphere('ball', 0.09, (0.38, -0.12, 0.09), flat('#E8524A', 0.4), segs=14, rings=8))
        objs.append(sphere('ted', 0.08, (0.3, -0.1, 0.45), flat('#B9783F', 0.9), segs=12, rings=8))
        for ex in (-1, 1):
            objs.append(sphere('tedear', 0.03, (0.3 + ex * 0.06, -0.1, 0.52), flat('#B9783F', 0.9), segs=8, rings=6))
    T.shop_window('swin', (x0 + 0.85, y0, PL + 0.22), 'y-', w=1.2, h=0.98, frame_col=wood, display=display, mullions=0,
                  back_col='#FFF1C9')
    T.door('door', (x1 - 0.58, y0, PL), 'y-', w=0.68, h=1.35, col='#3D7CC9', frame_col=wood, arch=True,
           step_depth=0.36)
    box('fascia', (S['W'] + 0.1, 0.12, 0.3), (S['x'], y0 - 0.06, PL + 1.5), mat=flat(wood, 0.6), bevel=0.03)
    T.awning_on('y-', S['W'] + 0.2, y0 + 0.02, PL + 1.82, PL + 1.48, 0.6, '#D9483B', 'cream', 6, x=S['x'], name='awn')
    T.emblem_at('roofteddy', T.em_teddy, (S['x'], y0 + 0.35, S['ridge'] + 0.25), scale=1.55, tilt=8.0)
    T.bracket_sign('bsign', (x1, y0), z=PL + 2.6, arm=0.55, r=0.36, bg='#F6D46A', rim='#D9483B', emblem=T.em_teddy,
                   es=0.7)
    # balloons tied to the bracket
    bx0 = Vector((x1 + 0.39, y0 - 0.39, PL + 2.6))
    for k, (dx, dy, dz, col) in enumerate(((-0.25, -0.1, 1.0, '#E8524A'), (0.05, -0.25, 1.15, '#3D7CC9'),
                                           (0.25, 0.05, 0.95, '#F2C14E'))):
        b = bx0 + Vector((dx, dy, dz))
        sphere('balloon', 0.17, tuple(b), flat(col, 0.25), scale=(1, 1, 1.18), segs=18, rings=10)
        cyl('bknot', 0.03, 0.05, tuple(b - Vector((0, 0, 0.22))), mat=flat(col, 0.25), segs=8, r_top=0.0)
        L.smooth_tube('bstring', [tuple(b - Vector((0, 0, 0.22))), tuple((b + bx0) / 2 + Vector((0.05, 0, -0.1))),
                                  tuple(bx0)], 0.006, flat('#F4F1EA', 0.6))
    # giant gift box by the door
    gx, gy = x1 + 0.35, y0 - 0.5
    box('gift', (0.48, 0.48, 0.42), (gx, gy, 0.0), mat=flat('#3FA58C', 0.5), bevel=0.03)
    box('giftlid', (0.54, 0.54, 0.1), (gx, gy, 0.42), mat=flat('#3FA58C', 0.5), bevel=0.03)
    box('ribbon1', (0.1, 0.56, 0.54), (gx, gy, -0.01), mat=flat('#F2C14E', 0.4), bevel=0.01)
    box('ribbon2', (0.56, 0.1, 0.54), (gx, gy, -0.01), mat=flat('#F2C14E', 0.4), bevel=0.01)
    for s in (-1, 1):
        sphere('bow', 0.1, (gx + s * 0.08, gy, 0.6), flat('#F2C14E', 0.4), scale=(1.2, 0.6, 0.8),
               rot=(0, s * 20, 45), segs=12, rings=8)
    T.flower_tub('tub', (x0 - 0.12, y0 - 0.3, 0.0), r=0.2, flowers=('#E8524A', '#F2C14E', '#3D7CC9'), seed=9)
    LA.snow_drift('d1', 0.22, (x1 + 0.3, S['y'] + 1.0, 0.0), seed=101)
    shop_marks(S, x1 - 0.58)
    return {'fx': {'sign': (S['x'], y0 + 0.35, S['ridge'] + 0.9)}}


# =========================================================================== RESTAURANT

REST_NOTE = ('Restaurant (3.2 x 3 m): warm terracotta half-timbered two-storey inn with a brown roof and a brick '
             'chimney (smoke at fxPoints.smoke), two lit windows with tables and candles, a plate-fork-knife bracket '
             'sign and a big round plate sign on the roof, a menu board, lantern string over the door. Shop markers '
             'as the other shops (customerPoints = waiting line at the menu board).')


@town('restaurant', 'building', 'town_shops', fp=(3.2, 3.0), notes=REST_NOTE, ko='식당', en='Restaurant',
      zone='shops')
def b_restaurant():
    S = shop_house(W=2.8, D=2.3, col='#E9B48F', roof='#7A4A2A', roof_along='x', seed=110, shutters='#7A4A2A',
                   chimney='#B4593F')
    x0, x1, y0, PL, ST = S['x0'], S['x1'], S['y0'], S['PL'], S['ST']
    wood = '#5E3A22'
    # timber beams on the upper storey front
    bm = flat(wood, 0.8)
    for k in range(5):
        x = x0 + 0.1 + (S['W'] - 0.2) * k / 4
        box('beam', (0.08, 0.06, ST - 0.1), (x, y0 - 0.03, PL + ST + 0.02), mat=bm, bevel=0.01)

    def display(objs):
        for k, x in enumerate((-0.3, 0.3)):
            objs.append(cyl('tleg', 0.02, 0.32, (x, -0.11, 0.0), mat=flat(wood, 0.7), segs=8))
            objs.append(cyl('ttop', 0.17, 0.03, (x, -0.11, 0.32), mat=flat('#F4F1EA', 0.6), segs=18))
            objs.append(cyl('candle', 0.02, 0.07, (x, -0.11, 0.35), mat=flat('#F4F1EA', 0.6), segs=8))
            objs.append(sphere('flame', 0.018, (x, -0.11, 0.44), L.emissive('cfl%d' % k, '#FFD45A', '#FFB347', 6.0),
                               segs=8, rings=6))
            objs.append(cyl('plate', 0.06, 0.012, (x - 0.08, -0.13, 0.35), mat=flat('#FFFFFF', 0.4), segs=14))
    T.shop_window('swin', (x0 + 0.85, y0, PL + 0.25), 'y-', w=1.2, h=0.95, frame_col=wood, display=display,
                  mullions=1, back_col='#FFD9A0')
    T.door('door', (x1 - 0.65, y0, PL), 'y-', w=0.74, h=1.38, col='#8A5A33', frame_col=wood, arch=True,
           step_depth=0.36, wreath=True)
    box('fascia', (S['W'] + 0.1, 0.12, 0.3), (S['x'], y0 - 0.06, PL + 1.5), mat=flat(wood, 0.6), bevel=0.03)
    rooftop_disc(S, 'rsign', T.em_plate, '#F2C14E', rim='#7A4A2A', r=0.58, es=1.0, along='x')
    T.bracket_sign('bsign', (x1, y0), z=PL + 2.6, arm=0.55, r=0.38, bg='#C0473A', rim='#F2C14E', emblem=T.em_plate,
                   es=0.78)
    # lantern string over the shop front
    pts = [(x0 + 0.1, y0 - 0.12, PL + 1.75), (S['x'] - 0.3, y0 - 0.2, PL + 1.62), (x1 - 0.1, y0 - 0.12, PL + 1.75)]
    L.smooth_tube('lstring', pts, 0.008, flat('#3D424C', 0.5))
    for k in range(6):
        t = (k + 0.5) / 6
        x = x0 + 0.1 + (S['W'] - 0.2) * t
        z = PL + 1.75 - 0.13 * math.sin(math.pi * t)
        sphere('bulb', 0.045, (x, y0 - 0.17, z - 0.05), L.emissive('bulb%d' % k, ['#FFD45A', '#FF8A5A', '#FFE7B0'][k % 3],
                                                                    '#FFC46A', 4.0), segs=10, rings=6)
    # menu board (blank) on an easel
    mx, my = x0 - 0.1, y0 - 0.65
    box('menu', (0.5, 0.05, 0.62), (mx, my, 0.45), rot=(10, 0, 0), mat=flat('#2F3B36', 0.8), bevel=0.015)
    box('menufr', (0.56, 0.06, 0.06), (mx, my, 1.06), rot=(10, 0, 0), mat=flat(wood, 0.7), bevel=0.01)
    for lx in (-0.22, 0.22):
        box('easel', (0.04, 0.04, 1.1), (mx + lx, my + 0.05, 0.0), rot=(10, 0, 0), mat=flat(wood, 0.7), bevel=0.01)
    for k in range(3):
        box('menuline', (0.32 - 0.05 * k, 0.01, 0.025), (mx, my - 0.04, 0.88 - 0.12 * k), rot=(10, 0, 0),
            mat=flat(['#F4F1EA', '#F2C14E', '#F4F1EA'][k], 0.8), bevel=0.0)
    PA.barrel_model('br', loc=(x1 + 0.3, y0 - 0.35, 0), scale=0.6, seed=11)
    T.flower_tub('tub', (x1 + 0.3, y0 - 0.9, 0.0), r=0.18, seed=10)
    LA.snow_drift('d1', 0.22, (x1 + 0.3, S['y'] + 1.0, 0.0), seed=111)
    shop_marks(S, x1 - 0.65)
    return {'fx': {'smoke': S['smoke'], 'sign': (S['x'], S['y'], S['ridge'] + 1.3)}}


# =========================================================================== SUPERMARKET

MART_NOTE = ('Supermarket (4.4 x 3.4 m): wide one-storey market hall with a stepped false front, green + white '
             'striped awning over a long lit glass front (shelves of cans, bread, fish, bottles), double sliding door, '
             'a big shopping-basket sign on the parapet and a basket bracket sign, produce crates outside (apples, '
             'cabbages, fish), a stack of red baskets and a trolley. customerPoints = queue at the door; staffPoints = '
             'clerk at the produce stand; inPoint = delivery bay on the right side (cans / fish / bread from the '
             'village).')


@town('supermarket', 'building', 'town_shops', fp=(4.4, 3.4), notes=MART_NOTE, ko='슈퍼마켓', en='Supermarket',
      zone='shops')
def b_supermarket():
    S = shop_house(W=4.0, D=2.6, col='#F2EEE6', roof=None, storeys=1, ST=2.35, seed=120, side_windows=False,
                   y=0.3)
    x0, x1, y0, PL, H = S['x0'], S['x1'], S['y0'], S['PL'], S['H']
    T.flat_roof('froof', S['W'], S['D'], H - 0.02, col='#F2EEE6', parapet=0.22, x=S['x'], y=S['y'], seed=121)
    top = false_front(S, 'ff', h=0.95, col='#F2EEE6', trim='#3E8E57', seed=122)
    S['ridge'] = top - 0.4
    green = '#3E8E57'
    box('stripe', (S['W'] + 0.02, 0.04, 0.22), (S['x'], y0 - 0.01, H - 0.38), mat=flat(green, 0.6), bevel=0.0)

    def shelves(objs):
        for row, z in enumerate((0.05, 0.42)):
            objs.append(box('sh', (1.25, 0.14, 0.03), (0, -0.1, z - 0.03), mat=flat('#C98F55', 0.7), bevel=0.01))
            for k in range(6):
                x = -0.52 + 0.21 * k
                kind = (k + row) % 3
                if kind == 0:
                    objs.append(BA.can_model('scan', r=0.05, h=0.08, loc=(x, -0.1, z), label=['#3D7CC9', '#D9483B'][k % 2],
                                             fish=False))
                    objs.append(BA.can_model('scan', r=0.05, h=0.08, loc=(x + 0.07, -0.1, z), label='#3E9A5A',
                                             fish=False))
                elif kind == 1:
                    objs.append(cyl('bot', 0.04, 0.2, (x, -0.1, z), mat=flat(['#4F86C2', '#7DB34A'][k % 2], 0.25),
                                    segs=10, r_top=0.025))
                else:
                    objs.append(sphere('loaf', 0.07, (x + 0.03, -0.1, z + 0.05), flat('#C9853F', 0.6),
                                       scale=(1.4, 0.8, 0.7), segs=12, rings=8))
    T.shop_window('swinL', (x0 + 0.85, y0, PL + 0.2), 'y-', w=1.35, h=1.05, frame_col=green, display=shelves,
                  mullions=1)
    T.shop_window('swinR', (x1 - 0.85, y0, PL + 0.2), 'y-', w=1.35, h=1.05, frame_col=green, display=shelves,
                  mullions=1)
    T.door('door', (S['x'], y0, PL), 'y-', w=0.95, h=1.45, col='#BFE3F2', frame_col=green, double=True,
           step_depth=0.4)
    T.awning_on('y-', S['W'] + 0.2, y0 + 0.02, PL + 1.92, PL + 1.55, 0.7, green, 'cream', 12, x=S['x'], name='awn')
    # big basket sign on the false front (faces the camera, standing in front of the parapet)
    rooftop_disc({'x': S['x'], 'y': y0 + 0.3, 'ridge': top - 0.05, 'y0': y0}, 'psign', T.em_basket, '#F4F1EA',
                 rim=green, r=0.62, es=1.05, along='x')
    T.bracket_sign('bsign', (x1, y0), z=PL + 2.25, arm=0.5, r=0.36, bg=green, rim='#F2C14E', emblem=T.em_basket,
                   es=0.72)
    # side window on +X
    T.win('sw', (x1, S['y'], PL + 1.6), 'x+', w=0.7, h=0.7, seed=123)
    # produce stand: crates of apples / cabbages / fish on a low table, left of the door
    tx, ty = x0 + 0.95, y0 - 0.95
    box('ptable', (1.5, 0.6, 0.4), (tx, ty, 0.0), mat=L.stripes('#C98F55', '#B27843', 6.0, 'X', soft=0.03), bevel=0.03)
    for k, (cx_, col) in enumerate(((-0.5, '#D9483B'), (0.0, '#7DB34A'), (0.5, 'fish'))):
        box('pcrate', (0.44, 0.5, 0.16), (tx + cx_, ty, 0.4), mat=flat('#D9A066', 0.75), bevel=0.02)
        if col == 'fish':
            for j in range(3):
                PA.fish_model('pfish', loc=(tx + cx_ - 0.1 + 0.1 * j, ty + 0.05 * (j % 2), 0.56), rot=(0, 0, 70 + 20 * j),
                              scale=0.32)
        else:
            for j in range(6):
                sphere('prod', 0.075 if col != '#7DB34A' else 0.1, (tx + cx_ - 0.12 + 0.12 * (j % 3), ty - 0.12 + 0.2 *
                                                                   (j // 3), 0.6), flat(col, 0.5), segs=12, rings=8)
    PA.snow_cap('psnow', 0.2, (tx + 0.55, ty + 0.2, 0.6), 0.05, 6, scale=(1.4, 0.8, 1.0))
    # trolley + stack of baskets right of the door
    rx, ry = x1 - 0.55, y0 - 0.95
    iron = flat('#B9C2CE', 0.3, 0.7)
    mb = L.MB()
    for sx in (-0.2, 0.2):
        for sy in (-0.28, 0.28):
            mb.seg(Vector((rx + sx, ry + sy, 0.12)), Vector((rx + sx * 1.15, ry + sy * 1.1, 0.75)), 0.018, iron, segs=6)
        mb.seg(Vector((rx + sx * 1.15, ry - 0.31, 0.75)), Vector((rx + sx * 1.15, ry + 0.31, 0.75)), 0.018, iron, segs=6)
    mb.seg(Vector((rx - 0.23, ry + 0.31, 0.75)), Vector((rx + 0.23, ry + 0.31, 0.75)), 0.018, iron, segs=6)
    mb.seg(Vector((rx - 0.23, ry - 0.31, 0.75)), Vector((rx + 0.23, ry - 0.31, 0.75)), 0.018, iron, segs=6)
    mb.seg(Vector((rx - 0.23, ry + 0.42, 0.95)), Vector((rx + 0.23, ry + 0.42, 0.95)), 0.025, flat('#D9483B', 0.4),
           segs=8)
    for sx in (-0.23, 0.23):
        mb.seg(Vector((rx + sx, ry + 0.31, 0.75)), Vector((rx + sx, ry + 0.42, 0.95)), 0.018, iron, segs=6)
    mb.done('trolley')
    box('tbask', (0.44, 0.6, 0.28), (rx, ry, 0.47), mat=L.stripes('#C3CCD8', '#9AA6B6', 14.0, 'X', soft=0.05),
        bevel=0.02)
    for sx in (-0.18, 0.18):
        for sy in (-0.22, 0.22):
            cyl('twh', 0.05, 0.04, (rx + sx, ry + sy, 0.05), rot=(0, 90, 0), mat=flat('#2B2F3A', 0.5), segs=10,
                origin='center')
    for k in range(4):
        box('bstack', (0.4, 0.3, 0.2), (x1 + 0.3, y0 - 0.25, 0.08 * k), mat=flat('#D9483B', 0.5), bevel=0.03,
            taper=(1.1, 1.1))
    LA.snow_drift('d1', 0.28, (x1 + 0.35, S['y'] + 1.1, 0.0), seed=125)
    shop_marks(S, S['x'], cust=3, staff=False)
    mark('staff', (tx + 0.85, ty - 0.35, 0.0), facing=(-0.6, -1, 0))
    return {'fx': {'sign': (S['x'], y0 + 0.3, top + 1.0)}}


# =========================================================================== HARDWARE STORE

HARD_NOTE = ('Hardware store (3.2 x 3 m): blue-grey clapboard shop with a charcoal roof and a stepped false front, '
             'a window of tools, a hammer-and-wrench bracket sign and a big round hammer-and-wrench sign on the false '
             'front; outside: shovels + brooms in a barrel, a ladder, paint pots, a wheelbarrow with a sack. Shop '
             'markers as the other shops (inPoint = where ingots / tools from the village are delivered).')


@town('hardware_store', 'building', 'town_shops', fp=(3.2, 3.0), notes=HARD_NOTE, ko='철물점', en='Hardware store',
      zone='shops')
def b_hardware_store():
    clap = L.stripes('#8FA7BD', '#7E96AC', 4.6, 'Z', rough=0.8, soft=0.05)
    S = shop_house(W=2.7, D=2.3, col='#8FA7BD', roof='#4A505C', roof_along='x', seed=130, shutters='#4A505C',
                   wall_mat=clap, storeys=1, ST=2.25, side_windows=True)
    x0, x1, y0, PL, H = S['x0'], S['x1'], S['y0'], S['PL'], S['H']
    top = false_front(S, 'ff', h=0.9, col='#E3D2B0', trim='#4A505C', seed=131)
    wood = '#4A505C'

    def display(objs):
        objs.append(box('pegboard', (1.2, 0.03, 0.8), (0, -0.05, 0.12), mat=flat('#C9A87A', 0.8), bevel=0.0))
        objs.append(BA.axe_model('dax', s=0.45, loc=(-0.38, -0.1, 0.62), rot=(90, 0, 0)))
        objs.append(BA.pick_model('dpk', s=0.4, loc=(0.0, -0.1, 0.62), rot=(90, 0, 0)))
        objs.append(BA.sickle_model('dsk', s=0.5, loc=(0.38, -0.1, 0.55), rot=(90, 0, 0)))
        for k in range(3):
            objs.append(cyl('pcan', 0.07, 0.12, (-0.3 + 0.3 * k, -0.12, 0.0), mat=flat(['#D9483B', '#3D7CC9',
                                                                                     '#F2C14E'][k], 0.4), segs=14))
    T.shop_window('swin', (x0 + 0.85, y0, PL + 0.2), 'y-', w=1.25, h=1.0, frame_col=wood, display=display, mullions=0)
    T.door('door', (x1 - 0.62, y0, PL), 'y-', w=0.72, h=1.4, col='#D9822B', frame_col=wood, step_depth=0.36)
    T.awning_on('y-', S['W'] + 0.2, y0 + 0.02, PL + 1.85, PL + 1.5, 0.6, '#D9822B', 'cream', 8, x=S['x'], name='awn')
    rooftop_disc({'x': S['x'], 'y': y0 + 0.3, 'ridge': top - 0.05, 'y0': y0}, 'psign', T.em_hammer_wrench, '#F4F1EA',
                 rim='#D9822B', r=0.56, es=1.0, along='x')
    T.bracket_sign('bsign', (x1, y0), z=PL + 2.2, arm=0.5, r=0.36, bg=wood, rim='#F2C14E', emblem=T.em_hammer_wrench,
                   es=0.75)
    # barrel of shovels / brooms
    bx, by = x0 + 0.05, y0 - 0.45
    PA.barrel_model('tb', loc=(bx, by, 0), scale=0.6, snow=False, seed=13)
    wood_m = tonal('#C98F55', 0.08, 3.0, rough=0.6)
    for k, (dx, dy, ang) in enumerate(((-0.06, 0.0, -10), (0.06, 0.04, 8), (0.0, -0.06, 2))):
        g = []
        g.append(cyl('handle', 0.025, 1.0, (0, 0, 0), mat=wood_m, segs=8))
        if k < 2:
            g.append(box('blade', (0.2, 0.04, 0.26), (0, 0, -0.18), mat=flat('#9AA6B6', 0.35, 0.6), bevel=0.03))
        else:
            g.append(cyl('broom', 0.1, 0.26, (0, 0, -0.22), mat=flat('#E2B85A', 0.9), segs=12, r_top=0.04))
        L.group(g, 'tool%d' % k, loc=(bx + dx, by + dy, 0.35 + (0.2 if k < 2 else 0.2)), rot=(0, ang, 0))
    # ladder leaning on the right wall
    lad = flat('#C98F55', 0.75)
    mb = L.MB()
    for s in (-1, 1):
        mb.seg(Vector((x1 + 0.45, S['y'] + s * 0.22, 0.0)), Vector((x1 + 0.08, S['y'] + s * 0.22, 1.9)), 0.03, lad,
               segs=8)
    for k in range(1, 7):
        t = k / 7
        mb.seg(Vector((x1 + 0.45 - 0.37 * t, S['y'] - 0.22, 1.9 * t)), Vector((x1 + 0.45 - 0.37 * t, S['y'] + 0.22,
                                                                             1.9 * t)), 0.022, lad, segs=6)
    mb.done('ladder')
    # wheelbarrow with a sack + paint pots
    wx, wy = x1 + 0.3, y0 - 0.7
    box('wbtub', (0.42, 0.62, 0.22), (wx, wy, 0.22), mat=flat('#3E8E57', 0.5), bevel=0.05, taper=(1.15, 1.2))
    cyl('wbwheel', 0.12, 0.06, (wx, wy - 0.42, 0.12), rot=(0, 90, 0), mat=flat('#2B2F3A', 0.5), segs=14,
        origin='center')
    for s in (-1, 1):
        box('wbh', (0.04, 0.5, 0.04), (wx + s * 0.18, wy + 0.42, 0.35), rot=(-20, 0, 0), mat=wood_m, bevel=0.01,
            origin='center')
        box('wbl', (0.04, 0.04, 0.22), (wx + s * 0.16, wy + 0.18, 0.0), mat=flat('#3D424C', 0.5), bevel=0.01)
    BA.sack('wbsack', (wx, wy, 0.3), s=0.6, seed=133)
    for k in range(3):
        cyl('ppot', 0.09, 0.14, (x0 + 0.55 + 0.2 * k, y0 - 0.55 - 0.05 * (k % 2), 0), mat=flat(['#D9483B', '#3D7CC9',
                                                                                              '#F2C14E'][k], 0.4),
            segs=14, bevel=0.01)
        cyl('ppotlid', 0.092, 0.02, (x0 + 0.55 + 0.2 * k, y0 - 0.55 - 0.05 * (k % 2), 0.14),
            mat=flat('#B9C2CE', 0.3, 0.7), segs=14)
    LA.snow_drift('d1', 0.22, (x1 + 0.3, S['y'] + 1.0, 0.0), seed=134)
    shop_marks(S, x1 - 0.62)
    return {'fx': {'sign': (S['x'], y0 + 0.3, top + 0.95)}}


# =========================================================================== CARPENTER WORKSHOP

CARP_NOTE = ('Carpenter workshop (3.4 x 3 m): timber workshop with a log base, plank walls and a wide open front '
             'showing a workbench with a vice and tools, a lumber rack of planks on the right side, a sawhorse with '
             'a plank and a hand saw out front, a big round saw sign on the roof and a saw bracket sign. staffPoints = '
             'the carpenter at the sawhorse (facing it), inPoint = where planks from the village sawmill are '
             'delivered, doorPoint = workshop entrance.')


@town('carpenter_workshop', 'building', 'town_shops', fp=(3.4, 3.0), notes=CARP_NOTE, ko='목공소',
      en='Carpenter workshop', zone='shops')
def b_carpenter_workshop():
    W, D, x, y = 2.7, 2.3, -0.2, 0.25
    x0, x1, y0, y1 = x - W / 2, x + W / 2, y - D / 2, y + D / 2
    H = 2.3
    planks = L.stripes('#C08A55', '#AE7A47', 4.2, 'Z', rough=0.8, soft=0.05)
    box('base', (W + 0.1, D + 0.1, 0.25), (x, y, 0), mat=snowy('stone', lo=0.6, hi=0.85), bevel=0.04)
    box('wback', (W, 0.14, H), (x, y1 - 0.07, 0.25), mat=planks, bevel=0.03)
    box('wright', (0.14, D, H), (x1 - 0.07, y, 0.25), mat=planks, bevel=0.03)
    box('wleft', (0.14, D, H), (x0 + 0.07, y, 0.25), mat=planks, bevel=0.03)
    box('floor', (W - 0.2, D - 0.15, 0.03), (x, y, 0.25), mat=flat('#8A5A33', 0.8), bevel=0.0)
    box('wfront', (0.5, 0.14, H), (x0 + 0.25, y0 + 0.07, 0.25), mat=planks, bevel=0.03)
    box('wfront2', (0.35, 0.14, H), (x1 - 0.175, y0 + 0.07, 0.25), mat=planks, bevel=0.03)
    box('lintel', (W, 0.18, 0.35), (x, y0 + 0.07, H - 0.1), mat=flat('#7A4A2A', 0.8), bevel=0.03)
    for px_ in (x0 + 0.5, x1 - 0.35):
        box('post', (0.16, 0.18, H), (px_, y0 + 0.07, 0.25), mat=flat('#7A4A2A', 0.8), bevel=0.03)
    inner = flat('#4A3424', 0.9)
    box('dark', (W - 0.3, 0.05, H - 0.2), (x, y1 - 0.16, 0.25), mat=inner, bevel=0.0)
    T.gable('roof', W, D, H + 0.25, H + 1.35, 0.35, '#5E4A3A', planks, seed=140, x=x, y=y)
    # inside: workbench with vice + tools on the back wall
    box('bench', (1.4, 0.5, 0.08), (x, y1 - 0.5, 0.95), mat=flat('#D9A066', 0.7), bevel=0.02)
    for bx in (-0.6, 0.6):
        box('bleg', (0.08, 0.4, 0.7), (x + bx, y1 - 0.5, 0.25), mat=flat('#8A5A33', 0.7), bevel=0.01)
    box('vice', (0.16, 0.14, 0.14), (x + 0.5, y1 - 0.72, 1.03), mat=flat('#3D7CC9', 0.4, 0.4), bevel=0.02)
    tl = L.Collect()
    with tl:
        T.em_saw(0.6)
    L.group(BA.top_level(tl.objs), 'wallsaw', loc=(x - 0.5, y1 - 0.25, 1.6))
    BA.axe_model('wallaxe', s=0.45, loc=(x + 0.1, y1 - 0.22, 1.7), rot=(90, 0, 0))
    box('shavings', (0.5, 0.3, 0.02), (x - 0.2, y1 - 0.75, 0.28), mat=flat('#F2D9A8', 0.9), bevel=0.0)
    L.point_light('wlamp', (x, y0 + 0.5, H - 0.2), 'window', 35.0, 0.3)
    # lumber rack on the right side
    rx = x1 + 0.35
    for ry in (y - 0.7, y + 0.7):
        box('rpost', (0.1, 0.1, 1.5), (rx + 0.2, ry, 0.0), mat=flat('#7A4A2A', 0.8), bevel=0.02)
        for z in (0.45, 0.95):
            box('rarm', (0.5, 0.08, 0.06), (rx, ry, z), mat=flat('#7A4A2A', 0.8), bevel=0.01)
    for k, z in enumerate((0.51, 0.57, 0.63, 1.01, 1.07)):
        box('rplank', (0.36 - 0.03 * (k % 2), 1.9, 0.06), (rx - 0.02 * k, y, z),
            mat=L.stripes('#E3B47A', '#D4A266', 9.0, 'X', soft=0.05), bevel=0.01)
    L.snow_slab('rsnow', 0.3, 1.6, 0.05, (rx, y, 1.13), seed=141)
    # sawhorse + plank + saw out front
    sx, sy = x + 0.35, y0 - 0.85
    for k in (-0.4, 0.4):
        for s in (-1, 1):
            box('shleg', (0.05, 0.05, 0.62), (sx + k, sy + s * 0.12, 0.0), rot=(s * 14, 0, 0), mat=flat('#8A5A33', 0.7),
                bevel=0.01)
    box('shbar', (1.0, 0.08, 0.08), (sx, sy, 0.58), mat=flat('#8A5A33', 0.7), bevel=0.01)
    box('shplank', (1.5, 0.3, 0.06), (sx - 0.1, sy, 0.66), mat=L.stripes('#E3B47A', '#D4A266', 9.0, 'Y', soft=0.05),
        bevel=0.01)
    with L.Collect() as sc_:
        T.em_saw(0.55)
    L.group(BA.top_level(sc_.objs), 'handsaw', loc=(sx + 0.35, sy - 0.02, 0.86), rot=(0, 0, 0))
    PA.log_pile('logs', 3, 0.11, 0.8, (x0 - 0.15, y0 - 0.45, 0), seed=142, axis='X')
    rooftop = {'x': x, 'y': y, 'ridge': H + 1.35, 'y0': y0}
    rooftop_disc(rooftop, 'rsign', T.em_saw, '#F2D9A8', rim='#7A4A2A', r=0.55, es=1.0, along='x')
    T.bracket_sign('bsign', (x1, y0), z=2.05, arm=0.5, r=0.36, bg='#7A4A2A', rim='#F2C14E', emblem=T.em_saw, es=0.75)
    LA.snow_drift('d1', 0.22, (x0 - 0.2, y1 + 0.2, 0.0), seed=143)
    mark('door', (x - 0.1, y0 - 0.55, 0.0), facing=(0, 1, 0))
    mark('customer', (x - 0.6, y0 - 1.05, 0.0), facing=(0, 1, 0))
    mark('staff', (sx, sy - 0.45, 0.0), facing=(0, 1, 0))
    mark('in', (x1 + 0.9, y - 0.2, 0.0))
    return {'fx': {'sawdust': (sx + 0.3, sy, 0.7), 'sign': (x, y, H + 2.4)}}


# =========================================================================== TOWN HALL

HALL_NOTE = ('Town hall (4.8 x 4.0 m): symmetric two-storey hall in warm cream stone with white columns, a '
             'pediment over the entrance, a teal roof and a central clock tower with a dome and a golden pinecone '
             'finial (the town mark), two flags, wide steps, lamp posts and flower tubs. fxPoints.clock / bell / flags; '
             'doorPoint = foot of the steps; gatherPoints = a small crowd in front (meetings, speeches); staffPoints = '
             'the mayor on the top step.')


@town('town_hall', 'building', 'town_civic', fp=(4.8, 4.0), catcher=30.0, notes=HALL_NOTE, ko='마을회관',
      en='Town hall', zone='civic')
def b_town_hall():
    W, D, X, Y = 4.2, 2.6, 0.0, 0.55
    x0, x1, y0, y1 = X - W / 2, X + W / 2, Y - D / 2, Y + D / 2
    PL, ST = 0.4, 1.5
    H = PL + 2 * ST
    stone = T.plaster('#EFE4CF')
    trim = '#FBF8F2'
    roof = '#3E8E8A'
    box('plinth', (W + 0.16, D + 0.16, PL), (X, Y, 0), mat=snowy('#B9B2A6', lo=0.7, hi=0.9), bevel=0.04)
    box('walls', (W, D, H - PL), (X, Y, PL), mat=stone, bevel=0.04)
    T.corner_trims('ctrim', W, D, PL, H - PL, trim, x=X, y=Y, t=0.2)
    T.band('band', W, D, PL + ST - 0.04, trim, h=0.12, x=X, y=Y, snow=True, seed=150)
    T.band('cornice', W, D, H - 0.14, trim, h=0.18, out=0.09, x=X, y=Y)
    ridge = H + 1.15
    T.gable('roof', W, D, H + 0.04, ridge, 0.32, roof, stone, seed=151, x=X, y=Y)
    for k, x in enumerate((x0 + 0.45, x0 + 1.05, x1 - 1.05, x1 - 0.45)):
        T.win('wf1_%d' % k, (x, y0, PL + 1.2), 'y-', w=0.46, h=0.7, seed=152 + k)
        T.win('wf2_%d' % k, (x, y0, PL + ST + 1.2), 'y-', w=0.46, h=0.7, seed=156 + k)
    for k, y in enumerate((Y - 0.55, Y + 0.55)):
        T.win('ws1_%d' % k, (x1, y, PL + 1.2), 'x+', w=0.46, h=0.7, seed=160 + k)
        T.win('ws2_%d' % k, (x1, y, PL + ST + 1.2), 'x+', w=0.46, h=0.7, seed=162 + k)
    # portico: 4 columns, entablature, pediment, steps
    T.door('door', (X, y0, PL), 'y-', w=1.0, h=1.55, col='#3E8E8A', frame_col='#C9A45A', double=True, step=False,
           arch=False)
    py = y0 - 0.8
    for cx in (-0.95, -0.35, 0.35, 0.95):
        cyl('col', 0.11, ST * 2 - 0.2, (X + cx, py, PL), mat=flat('#FBF8F2', 0.55), segs=18, bevel=0.02)
        box('colb', (0.3, 0.3, 0.12), (X + cx, py, PL), mat=flat('#FBF8F2', 0.55), bevel=0.02)
        box('colc', (0.3, 0.3, 0.1), (X + cx, py, PL + ST * 2 - 0.3), mat=flat('#FBF8F2', 0.55), bevel=0.02)
    box('portfloor', (2.5, 1.0, PL), (X, y0 - 0.45, 0), mat=snowy('#C9C2B6', lo=0.65, hi=0.85), bevel=0.03)
    for k in range(3):
        box('step', (2.7 - 0.0 * k, 0.28, PL * (1 - k / 3.0)), (X, y0 - 1.05 - 0.26 * k, 0),
            mat=snowy('#C9C2B6', lo=0.6, hi=0.82), bevel=0.03)
    box('entab', (2.5, 1.05, 0.22), (X, y0 - 0.45, PL + ST * 2 - 0.2), mat=flat('#FBF8F2', 0.55), bevel=0.03)
    T.gable('ped', 2.4, 1.05, PL + ST * 2 + 0.02, PL + ST * 2 + 0.72, 0.1, roof, T.plaster('#FBF8F2'), seed=164,
            x=X, y=y0 - 0.45, along='y', snow_frac=(0.7, 0.7))
    with L.Collect() as pc:
        T.em_pinecone(0.5)
    L.group(BA.top_level(pc.objs), 'pedcone', loc=(X, y0 - 1.0, PL + ST * 2 + 0.32), rot=(0, 0, 0))
    # clock tower on the ridge
    tz = ridge - 0.5
    TW = 1.05
    box('tower', (TW, TW, 1.5), (X, Y, tz), mat=stone, bevel=0.03)
    T.corner_trims('ttrim', TW, TW, tz, 1.5, trim, x=X, y=Y, t=0.12)
    T.band('tband', TW, TW, tz + 1.45, trim, h=0.12, out=0.06, x=X, y=Y)
    for face, loc in (('y-', (X, Y - TW / 2 - 0.03, tz + 0.85)), ('x+', (X + TW / 2 + 0.03, Y, tz + 0.85))):
        with L.Collect() as cc:
            T.em_clock(1.05)
        g = L.group(BA.top_level(cc.objs), 'clock_' + face, loc=loc, rot=(0, 0, T.FACE_RZ[face]))
        del g
    dz = tz + 1.57
    cyl('drum', 0.42, 0.3, (X, Y, dz), mat=flat('#FBF8F2', 0.55), segs=28, bevel=0.02)
    for k in range(8):
        a = math.tau * k / 8
        box('drumwin', (0.1, 0.06, 0.18), (X + 0.43 * math.cos(a), Y + 0.43 * math.sin(a), dz + 0.06),
            rot=(0, 0, math.degrees(a) + 90), mat=T.glow_mat('dw%d' % k, 1.6), bevel=0.01)
    sphere('dome', 0.46, (X, Y, dz + 0.3), flat(roof, 0.5), scale=(1, 1, 0.95), segs=28, rings=14)
    PA.snow_cap('domesnow', 0.3, (X - 0.05, Y + 0.05, dz + 0.68), 0.1, 3)
    with L.Collect() as fc:
        T.em_pinecone(0.55)
    L.group(BA.top_level(fc.objs), 'finial', loc=(X, Y, dz + 0.98))
    cyl('finpost', 0.03, 0.25, (X, Y, dz + 0.72), mat=flat('#F2C14E', 0.3, 0.7), segs=8)
    # flags on the two front corners
    for s, col in ((-1, '#3E8E8A'), (1, '#D9483B')):
        fx = X + s * (W / 2 + 0.25)
        cyl('fpole', 0.035, 2.9, (fx, y0 - 0.35, 0), mat=flat('#E3E9F0', 0.3, 0.6), segs=10)
        sphere('ftop', 0.06, (fx, y0 - 0.35, 2.92), flat('gold', 0.3, 0.8), segs=10, rings=6)
        PA.flag('flag%d' % (s > 0), (fx + 0.02, y0 - 0.35, 2.82), 0.62, 0.4, col, seed=5 + s, emblem=True)
    for s in (-1, 1):
        T.street_lamp('slamp%d' % (s > 0), (X + s * 1.55, y0 - 1.45, 0.0), h=2.2)
        T.flower_tub('tub%d' % (s > 0), (X + s * 1.1, y0 - 1.45, 0.0), r=0.22, evergreen=True, seed=150 + s)
    LA.snow_drift('d1', 0.26, (x1 + 0.3, y1 + 0.1, 0.0), seed=165)
    mark('door', (X, y0 - 2.05, 0.0), facing=(0, 1, 0))
    mark('staff', (X, y0 - 0.7, PL), facing=(0, -1, 0))
    for k in range(6):
        row, col_ = divmod(k, 3)
        mark('gather', (X - 0.6 + 0.6 * col_ + 0.2 * row, y0 - 2.4 - 0.45 * row, 0.0), facing=(0, 1, 0))
    return {'fx': {'clock': (X, Y - TW / 2, tz + 0.85), 'bell': (X, Y, dz + 0.2), 'flagL': (X - W / 2 - 0.25, y0 - 0.35,
                                                                                            2.6),
                   'flagR': (X + W / 2 + 0.25, y0 - 0.35, 2.6)}}


# =========================================================================== POST OFFICE

POST_NOTE = ('Post office (3.4 x 3.2 m): cream two-storey building with red trim, a red roof and a red door, an '
             'envelope sign on the roof and at the corner, a big round-topped red mailbox in front (mailPoint), a '
             'parcel stack and a little red mail sled, a lit service window. doorPoint, customerPoints (queue to the '
             'counter inside), staffPoints = the postman by the mailbox, inPoint = parcel drop.')


@town('post_office', 'building', 'town_civic', fp=(3.4, 3.2), notes=POST_NOTE, ko='우체국', en='Post office',
      zone='civic')
def b_post_office():
    S = shop_house(W=2.8, D=2.4, col='#F6EBD2', roof='#C8473A', roof_along='x', seed=170, shutters='#C8473A',
                   trim='#C8473A')
    x0, x1, y0, PL = S['x0'], S['x1'], S['y0'], S['PL']
    red = '#C8473A'

    def display(objs):
        objs.append(box('counter', (1.1, 0.12, 0.35), (0, -0.1, 0.0), mat=flat('#8A5A33', 0.7), bevel=0.02))
        for k in range(4):
            objs.append(box('parcel', (0.14 + 0.03 * (k % 2), 0.1, 0.1 + 0.03 * k), (-0.4 + 0.27 * k, -0.11, 0.35),
                            mat=flat('#C9A06A', 0.8), bevel=0.01))
            objs.append(box('ptape', (0.03, 0.11, 0.1 + 0.03 * k), (-0.4 + 0.27 * k, -0.11, 0.35),
                            mat=flat(red, 0.6), bevel=0.0))
        for k in range(5):
            objs.append(box('slot', (0.16, 0.02, 0.1), (-0.4 + 0.2 * k, -0.04, 0.68), mat=flat('#F4F1EA', 0.7),
                            bevel=0.005))
    T.shop_window('swin', (x0 + 0.9, y0, PL + 0.22), 'y-', w=1.3, h=1.0, frame_col=red, display=display, mullions=1)
    T.door('door', (x1 - 0.62, y0, PL), 'y-', w=0.74, h=1.4, col=red, frame_col='#F4F1EA', step_depth=0.36,
           canopy=True, canopy_col=red)
    rooftop_disc(S, 'rsign', T.em_envelope, red, rim='#F2C14E', r=0.55, es=1.05, along='x')
    T.bracket_sign('bsign', (x1, y0), z=PL + 2.6, arm=0.55, r=0.38, bg=red, rim='#F2C14E', emblem=T.em_envelope,
                   es=0.8)
    # big mailbox (round top) in front
    mx, my = x0 + 0.15, y0 - 0.85
    box('mbbody', (0.44, 0.4, 0.8), (mx, my, 0.12), mat=flat(red, 0.45), bevel=0.06)
    cyl('mbtop', 0.22, 0.44, (mx, my, 0.92), rot=(0, 90, 0), mat=flat(red, 0.45), segs=24, origin='center',
        scale=(1.0, 0.92, 1.0))
    box('mbslot', (0.26, 0.04, 0.05), (mx, my - 0.21, 0.78), mat=flat('#2B2F3A', 0.5), bevel=0.01)
    box('mbplate', (0.2, 0.03, 0.14), (mx, my - 0.205, 0.45), mat=flat('#F4F1EA', 0.6), bevel=0.01)
    box('mbbase', (0.5, 0.46, 0.12), (mx, my, 0.0), mat=flat('#3D424C', 0.5), bevel=0.02)
    PA.snow_cap('mbsnow', 0.2, (mx, my, 1.08), 0.07, 3, scale=(1.1, 0.9, 1.0))
    # mail sled with parcels
    sx, sy = x1 + 0.35, y0 - 0.55
    with L.Collect() as sc_:
        box('sbed', (0.5, 0.8, 0.08), (0, 0, 0.18), mat=flat(red, 0.5), bevel=0.02)
        for s in (-1, 1):
            L.smooth_tube('srun', [(s * 0.22, 0.42, 0.25), (s * 0.22, 0.45, 0.06), (s * 0.22, 0.3, 0.02),
                                   (s * 0.22, -0.4, 0.02)], 0.02, flat('#3D424C', 0.4, 0.6))
            box('sleg', (0.03, 0.03, 0.16), (s * 0.22, -0.2, 0.02), mat=flat('#3D424C', 0.4, 0.6), bevel=0.0)
            box('sleg2', (0.03, 0.03, 0.16), (s * 0.22, 0.2, 0.02), mat=flat('#3D424C', 0.4, 0.6), bevel=0.0)
        for k, (px_, py_, pz, sz) in enumerate(((0, -0.15, 0.26, 0.3), (0.0, 0.18, 0.26, 0.26), (0.02, 0.0, 0.52,
                                                                                                0.22))):
            box('par', (sz, sz, sz * 0.8), (px_, py_, pz), mat=flat('#C9A06A', 0.8), bevel=0.02)
            box('part', (0.04, sz + 0.01, sz * 0.8 + 0.01), (px_, py_, pz - 0.005), mat=flat(red, 0.6), bevel=0.0)
    L.group(BA.top_level(sc_.objs), 'mailsled', loc=(sx, sy, 0), rot=(0, 0, 0))
    T.lamp_wall('lamp', (x0 + 0.22, y0, PL + 1.75), 'y-')
    LA.snow_drift('d1', 0.24, (x1 + 0.3, S['y'] + 1.0, 0.0), seed=171)
    shop_marks(S, x1 - 0.62, staff=False)
    mark('staff', (mx + 0.45, my - 0.2, 0.0), facing=(-0.4, -1, 0))
    return {'fx': {'mail': (mx, my, 0.8), 'sign': (S['x'], S['y'], S['ridge'] + 1.2)}}


# =========================================================================== CLINIC

CLINIC_NOTE = ('Clinic (3.6 x 3.2 m): clean white two-storey clinic with mint trim and a mint roof, a big red heart-'
               'with-a-plus sign on the roof and at the corner, a glass entrance under a canopy, a bench for waiting '
               'patients (seatPoints), a little ambulance sled. doorPoint, customerPoints (patients waiting), '
               'staffPoints = the nurse at the door.')


@town('clinic', 'building', 'town_civic', fp=(3.6, 3.2), notes=CLINIC_NOTE, ko='병원', en='Clinic', zone='civic')
def b_clinic():
    S = shop_house(W=3.0, D=2.4, col='#F7F7F2', roof='#5FB8A5', roof_along='x', seed=180, shutters='#5FB8A5',
                   trim='#5FB8A5')
    x0, x1, y0, PL, ST = S['x0'], S['x1'], S['y0'], S['PL'], S['ST']
    mint = '#5FB8A5'
    for k, x in enumerate((x0 + 0.45, x0 + 1.1)):
        T.win('wf1_%d' % k, (x, y0, PL + 1.15), 'y-', w=0.5, h=0.6, shutters=mint, seed=181 + k)
    T.door('door', (x1 - 0.8, y0, PL), 'y-', w=0.95, h=1.45, col='#BFE3F2', frame_col=mint, double=True,
           step_depth=0.4, canopy=(0.75, PL + 1.75), canopy_col=mint)
    box('redline', (S['W'] + 0.02, 0.03, 0.12), (S['x'], y0 - 0.015, PL + ST - 0.25), mat=flat('#E8524A', 0.5),
        bevel=0.0)
    rooftop_disc(S, 'rsign', T.em_heart_plus, '#F7F7F2', rim=mint, r=0.55, es=1.05, along='x')
    T.bracket_sign('bsign', (x1, y0), z=PL + 2.65, arm=0.55, r=0.38, bg='#F7F7F2', rim=mint, emblem=T.em_heart_plus,
                   es=0.85)
    T.town_bench('bench', (x0 + 0.65, y0 - 0.85, 0.0), rot_z=0.0, col='#E3D2B0')
    # ambulance sled (white with a red stripe + heart)
    ax, ay = x1 + 0.45, y0 - 0.2
    with L.Collect() as ac:
        box('abody', (0.62, 1.05, 0.55), (0, 0, 0.2), mat=flat('#F7F7F2', 0.5), bevel=0.08)
        box('astripe', (0.64, 1.07, 0.08), (0, 0, 0.42), mat=flat('#E8524A', 0.5), bevel=0.01)
        box('awin', (0.5, 0.05, 0.2), (0, -0.53, 0.5), mat=flat('#9CC7E6', 0.15), bevel=0.02)
        for s in (-1, 1):
            L.smooth_tube('arun', [(s * 0.26, -0.62, 0.22), (s * 0.26, -0.62, 0.05), (s * 0.26, -0.45, 0.0),
                                   (s * 0.26, 0.5, 0.0)], 0.022, flat('#3D424C', 0.4, 0.6))
        sphere('alight', 0.07, (0, -0.2, 0.8), L.emissive('alt', '#5A9BFF', '#5A9BFF', 2.0), segs=12, rings=8)
        with L.Collect() as hc:
            T.em_heart_plus(0.38)
        L.group(BA.top_level(hc.objs), 'aheart', loc=(0.32, 0.1, 0.5), rot=(0, 0, 90))
        PA.snow_cap('asnow', 0.2, (0, 0.2, 0.76), 0.06, 4, scale=(1.2, 1.6, 1.0))
    L.group(BA.top_level(ac.objs), 'ambulance', loc=(ax, ay, 0))
    T.flower_tub('tub', (x1 - 0.15, y0 - 0.9, 0.0), r=0.2, evergreen=True, seed=18)
    LA.snow_drift('d1', 0.24, (x1 + 0.3, S['y'] + 1.0, 0.0), seed=182)
    shop_marks(S, x1 - 0.8, cust=2, staff=False)
    mark('staff', (x1 - 0.2, y0 - 0.55, 0.0), facing=(-0.4, -1, 0))
    mark('seat', (x0 + 0.4, y0 - 0.85, 0.0), facing=(0, -1, 0))
    mark('seat', (x0 + 0.9, y0 - 0.85, 0.0), facing=(0, -1, 0))
    return {'fx': {'sign': (S['x'], S['y'], S['ridge'] + 1.2), 'siren': (ax, ay - 0.2, 0.85)}}


# =========================================================================== POLICE BOX

POLICE_NOTE = ('Police box (2.2 x 2.2 m): small navy sentry booth with white bands, a big window, a blue-and-red '
               'light on the flat roof, a gold star badge sign, a bicycle and a little bench. staffPoints = the '
               'officer standing guard in front, doorPoint = booth door.')


@town('police_box', 'building', 'town_civic', fp=(2.2, 2.2), notes=POLICE_NOTE, ko='경찰 초소', en='Police box',
      zone='civic')
def b_police_box():
    W, D, X, Y = 1.6, 1.5, 0.0, 0.2
    x0, x1, y0, y1 = X - W / 2, X + W / 2, Y - D / 2, Y + D / 2
    navy = '#2E4F8A'
    H = 2.1
    T.plinth('plinth', W, D, h=0.15, x=X, y=Y)
    box('walls', (W, D, H - 0.15), (X, Y, 0.15), mat=flat(navy, 0.55), bevel=0.05)
    T.band('band1', W, D, 0.85, '#F4F1EA', h=0.1, x=X, y=Y)
    T.band('band2', W, D, H - 0.18, '#F4F1EA', h=0.16, out=0.06, x=X, y=Y)
    T.flat_roof('roof', W + 0.1, D + 0.1, H - 0.02, col=navy, parapet=0.12, x=X, y=Y, seed=190, cap_col='#F4F1EA')
    # light bar
    cyl('lbase', 0.12, 0.1, (X, Y, H + 0.12), mat=flat('#3D424C', 0.5), segs=14)
    sphere('lblue', 0.11, (X - 0.08, Y + 0.08, H + 0.3), L.emissive('lb', '#5A9BFF', '#5A9BFF', 2.5), segs=14,
           rings=8)
    sphere('lred', 0.11, (X + 0.08, Y - 0.08, H + 0.3), L.emissive('lr', '#FF5A5A', '#FF5A5A', 2.5), segs=14, rings=8)
    T.door('door', (X + 0.35, y0, 0.15), 'y-', w=0.6, h=1.4, col='#3B6FB0', frame_col='#F4F1EA', step_depth=0.32)
    T.win('fwin', (X - 0.3, y0, 1.75), 'y-', w=0.62, h=0.62, seed=191)
    T.win('swin', (x1, Y, 1.75), 'x+', w=0.7, h=0.62, seed=192)
    T.sign_disc('star', (X - 0.05, y0 - 0.1, H + 0.55), r=0.42, bg=navy, rim='#F2C14E', emblem=T.em_star, es=0.9,
                tilt=6.0)
    # bicycle leaning on the right side
    bx, by = x1 + 0.22, Y - 0.15
    iron = flat('#D9483B', 0.4, 0.3)
    dk = flat('#2B2F3A', 0.5)
    mb = L.MB()
    for wy in (-0.42, 0.42):
        ring = [Vector((bx, by + wy + 0.28 * math.cos(t), 0.28 + 0.28 * math.sin(t))) for t in
                [math.tau * k / 20 for k in range(21)]]
        for a_, b_ in zip(ring, ring[1:]):
            mb.seg(a_, b_, 0.025, dk, segs=6)
    for p, q in (((0, -0.42, 0.28), (0, 0.0, 0.3)), ((0, 0.0, 0.3), (0, 0.42, 0.28)), ((0, 0.0, 0.3), (0, -0.05, 0.62)),
                 ((0, -0.05, 0.62), (0, 0.35, 0.6)), ((0, 0.35, 0.6), (0, 0.42, 0.28)), ((0, 0.35, 0.6), (0, 0.38, 0.78))):
        mb.seg(Vector((bx + p[0], by + p[1], p[2])), Vector((bx + q[0], by + q[1], q[2])), 0.022, iron, segs=6)
    mb.seg(Vector((bx - 0.18, by + 0.38, 0.78)), Vector((bx + 0.18, by + 0.38, 0.78)), 0.02, dk, segs=6)
    mb.cube((0.12, 0.22, 0.05), dk, loc=(bx, by - 0.06, 0.66))
    mb.done('bike')
    PA.snow_cap('bksnow', 0.1, (bx, by - 0.06, 0.7), 0.04, 5)
    T.town_bench('bench', (X - 0.55, y0 - 0.75, 0.0), rot_z=0.0)
    LA.snow_drift('d1', 0.2, (x1 + 0.2, y1 + 0.2, 0.0), seed=193)
    mark('door', (X + 0.35, y0 - 0.65, 0.0), facing=(0, 1, 0))
    mark('staff', (X - 0.55, y0 - 0.25, 0.0), facing=(0, -1, 0))
    mark('seat', (X - 0.8, y0 - 0.75, 0.0), facing=(0, -1, 0))
    mark('seat', (X - 0.3, y0 - 0.75, 0.0), facing=(0, -1, 0))
    return {'fx': {'siren': (X, Y, H + 0.3)}}


# =========================================================================== FIRE STATION

FIRE_NOTE = ('Fire station (4.2 x 3.6 m): red-brick two-storey station with a cream trim, a wide arched garage door '
             'standing open with the nose of a shiny red fire sled-engine (ladder on top) inside, a tall hose-drying '
             'tower with a bell and a lamp, a fire-helmet sign on the roof and at the corner, a hydrant. staffPoints = '
             'firefighter by the garage, doorPoint = side door, fxPoints.bell / siren.')


@town('fire_station', 'building', 'town_civic', fp=(4.2, 3.6), catcher=28.0, notes=FIRE_NOTE, ko='소방서',
      en='Fire station', zone='civic')
def b_fire_station():
    W, D, X, Y = 3.0, 2.6, -0.35, 0.3
    x0, x1, y0, y1 = X - W / 2, X + W / 2, Y - D / 2, Y + D / 2
    PL, ST = 0.15, 1.55
    H = PL + 2 * ST
    brick = L.brick('#C2503A', '#A8432F', '#E3D6C6', scale=3.0, row_h=0.4, snow_top=False)
    cream = '#F3E6C8'
    T.plinth('plinth', W, D, h=PL, x=X, y=Y)
    box('wback', (W, 0.2, H - PL), (X, y1 - 0.1, PL), mat=brick, bevel=0.04)
    box('wright', (0.2, D, H - PL), (x1 - 0.1, Y, PL), mat=brick, bevel=0.04)
    box('wleft', (0.2, D, H - PL), (x0 + 0.1, Y, PL), mat=brick, bevel=0.04)
    gw, gh = 1.7, 1.9                                   # garage opening
    gx = X - 0.25
    box('wfrontL', (gx - gw / 2 - x0, 0.2, H - PL), ((x0 + gx - gw / 2) / 2, y0 + 0.1, PL), mat=brick, bevel=0.03)
    box('wfrontR', (x1 - (gx + gw / 2), 0.2, H - PL), ((x1 + gx + gw / 2) / 2, y0 + 0.1, PL), mat=brick, bevel=0.03)
    box('wfrontT', (gw, 0.2, H - PL - gh), (gx, y0 + 0.1, PL + gh), mat=brick, bevel=0.03)
    box('interior', (W - 0.4, D - 0.4, 0.02), (X, Y, PL), mat=flat('#8E96A3', 0.8), bevel=0.0)
    box('backdark', (W - 0.4, 0.04, gh), (X, y1 - 0.22, PL), mat=flat('#4A3A36', 0.9), bevel=0.0)
    box('ceiling', (W - 0.4, D - 0.4, 0.06), (X, Y, PL + gh), mat=flat('#4A3A36', 0.9), bevel=0.0)
    T.corner_trims('ctrim', W, D, PL, H - PL, cream, x=X, y=Y)
    T.band('band', W, D, PL + ST + 0.38, cream, h=0.1, x=X, y=Y, snow=True, seed=200)
    T.band('cornice', W, D, H - 0.1, cream, h=0.14, out=0.07, x=X, y=Y)
    # garage frame arch + folded door at the top
    box('gframeT', (gw + 0.24, 0.12, 0.14), (gx, y0 - 0.02, PL + gh - 0.02), mat=flat(cream, 0.7), bevel=0.03)
    for s in (-1, 1):
        box('gframeS', (0.12, 0.12, gh), (gx + s * (gw / 2 + 0.06), y0 - 0.02, PL), mat=flat(cream, 0.7), bevel=0.03)
    box('gdoor', (gw - 0.05, 0.1, 0.22), (gx, y0 + 0.08, PL + gh - 0.3), mat=L.stripes('#F4F1EA', '#D9D2C4', 8.0, 'Z'),
        bevel=0.02)
    T.flat_roof('roof', W, D, H - 0.02, col='#A8432F', parapet=0.24, x=X, y=Y, seed=201, cap_col=cream)
    for k, x in enumerate((x0 + 0.45, gx, x1 - 0.45)):
        T.win('wf2_%d' % k, (x, y0, PL + ST + 1.25), 'y-', w=0.48, h=0.6, shutters=None, seed=202 + k)
    T.win('ws1', (x1, Y, PL + 1.35), 'x+', w=0.55, h=0.6, seed=205)
    T.win('ws2', (x1, Y, PL + ST + 1.25), 'x+', w=0.55, h=0.6, seed=206)
    # fire sled-engine inside the garage (nose sticking out a little)
    fy = Y - 0.25
    red = flat('#D9483B', 0.35)
    with L.Collect() as ec:
        box('cab', (1.05, 0.9, 0.85), (0, -0.55, 0.28), mat=red, bevel=0.1)
        box('cabwin', (0.85, 0.06, 0.32), (0, -1.0, 0.72), mat=flat('#9CC7E6', 0.12), bevel=0.03)
        box('body', (1.05, 1.4, 0.7), (0, 0.6, 0.28), mat=red, bevel=0.06)
        box('stripe', (1.07, 2.4, 0.08), (0, 0.05, 0.6), mat=flat('#F2C14E', 0.4), bevel=0.01)
        box('grille', (0.6, 0.05, 0.22), (0, -1.0, 0.36), mat=flat('#B9C2CE', 0.3, 0.7), bevel=0.02)
        for s in (-1, 1):
            lamp_ = sphere('hl', 0.07, (s * 0.38, -1.0, 0.45), L.emissive('fhl%d' % (s > 0), '#FFF1C4', '#FFD27A', 3.0),
                           segs=12, rings=8)
            del lamp_
            L.smooth_tube('frun', [(s * 0.45, -1.15, 0.3), (s * 0.45, -1.1, 0.06), (s * 0.45, -0.85, 0.0),
                                   (s * 0.45, 1.25, 0.0)], 0.03, flat('#3D424C', 0.4, 0.6))
        sphere('siren', 0.08, (-0.25, -0.6, 1.17), L.emissive('fsir', '#FF4A3A', '#FF4A3A', 3.0), segs=12, rings=8)
        sphere('siren2', 0.08, (0.25, -0.6, 1.17), L.emissive('fsir2', '#5A9BFF', '#5A9BFF', 2.5), segs=12, rings=8)
        lad = flat('#E3E9F0', 0.3, 0.6)
        mb = L.MB()
        for s in (-1, 1):
            mb.seg(Vector((s * 0.22, -0.2, 1.05)), Vector((s * 0.22, 1.3, 1.02)), 0.025, lad, segs=6)
        for k in range(8):
            y = -0.15 + 0.19 * k
            mb.seg(Vector((-0.22, y, 1.04)), Vector((0.22, y, 1.04)), 0.018, lad, segs=6)
        mb.done('ladder')
        cyl('reel', 0.18, 0.3, (0.55, 0.6, 0.62), rot=(0, 90, 0), mat=flat('#F2C14E', 0.4), segs=18, origin='center')
    L.group(BA.top_level(ec.objs), 'engine', loc=(gx, fy, PL))
    L.point_light('glight', (gx, Y, PL + gh - 0.3), 'window', 30.0, 0.3)
    # hose tower on the right back corner
    tx, ty = x1 - 0.2, y1 + 0.05
    box('tower', (0.9, 0.9, 4.4), (tx, ty, 0), mat=brick, bevel=0.03)
    T.corner_trims('tt', 0.9, 0.9, 0.0, 4.4, cream, x=tx, y=ty, t=0.1)
    T.band('tb', 0.9, 0.9, 4.35, cream, h=0.12, out=0.06, x=tx, y=ty)
    tz = 4.47
    for sx in (-1, 1):
        for sy in (-1, 1):
            box('tpost', (0.1, 0.1, 0.75), (tx + sx * 0.35, ty + sy * 0.35, tz), mat=flat(cream, 0.7), bevel=0.02)
    T.hip_cap('troof', 1.12, 1.12, tz + 0.75, 0.6, '#A8432F', seed=207, x=tx, y=ty)
    with L.Collect() as bc_:
        T.bell_model('fbell', s=1.15, col='#E2B33C')
    L.group(BA.top_level(bc_.objs), 'fbellg', loc=(tx, ty, tz + 0.7))
    T.win('twin', (tx + 0.45, ty, 3.6), 'x+', w=0.36, h=0.5, seed=208)
    T.win('twin2', (tx, ty - 0.45, 3.6), 'y-', w=0.36, h=0.5, seed=209)
    # signs
    T.sign_disc('rsign', (X - 0.35, y0 + 0.15, H + 0.7), r=0.55, bg='#F3E6C8', rim='#D9483B', emblem=T.em_helmet,
                es=1.05, tilt=8.0)
    for s in (-1, 1):
        cyl('rsleg', 0.04, 0.42, (X - 0.35 + s * 0.3, y0 + 0.15 + s * 0.3, H + 0.2), mat=flat('#3D424C', 0.4, 0.6),
            segs=8)
    T.bracket_sign('bsign', (x1, y0), z=PL + 2.65, arm=0.55, r=0.38, bg='#D9483B', rim='#F2C14E', emblem=T.em_helmet,
                   es=0.8)
    # hydrant + side door + lamp
    hx, hy = x1 + 0.35, y0 - 0.55
    cyl('hyd', 0.12, 0.5, (hx, hy, 0), mat=flat('#D9483B', 0.4), segs=16, bevel=0.03)
    sphere('hydtop', 0.13, (hx, hy, 0.5), flat('#D9483B', 0.4), scale=(1, 1, 0.7), segs=16, rings=8)
    for s in (-1, 1):
        cyl('hydarm', 0.05, 0.12, (hx + s * 0.12, hy, 0.32), rot=(0, 90, 0), mat=flat('#F2C14E', 0.4), segs=10,
            origin='center')
    PA.snow_cap('hydsnow', 0.1, (hx, hy, 0.6), 0.05, 2)
    T.door('sdoor', (x1, Y + 0.6, PL), 'x+', w=0.6, h=1.3, col='#D9483B', frame_col=cream, step_depth=0.32)
    T.lamp_wall('lamp', (x0 + 0.25, y0, PL + 2.0), 'y-')
    LA.snow_drift('d1', 0.26, (x0 - 0.2, y1 + 0.2, 0.0), seed=210)
    mark('door', (x1 + 0.6, Y + 0.6, 0.0), facing=(-1, 0, 0))
    mark('staff', (gx + 1.15, y0 - 0.55, 0.0), facing=(-0.4, -1, 0))
    mark('gather', (gx, y0 - 1.0, 0.0), facing=(0, 1, 0))
    return {'fx': {'bell': (tx, ty, tz + 0.45), 'siren': (gx, fy - 0.6, PL + 1.2), 'garage': (gx, y0, PL + 0.8)}}


# =========================================================================== APARTMENTS

def balcony(name, loc, face='y-', w=0.95, col='#F4F1EA', rail='#F4F1EA', plants=True, seed=0):
    """Small balcony slab + railing on a wall (face frame), with a flower pot and a snow lump."""
    objs = [box(name + '_slab', (w, 0.5, 0.1), (0, -0.25, 0.0), mat=flat(col, 0.7), bevel=0.03)]
    rm = flat(rail, 0.6)
    mb = L.MB()
    for k in range(7):
        x = -w / 2 + 0.05 + (w - 0.1) * k / 6
        mb.seg(Vector((x, -0.47, 0.1)), Vector((x, -0.47, 0.5)), 0.016, rm, segs=6)
    for s in (-1, 1):
        mb.seg(Vector((s * (w / 2 - 0.05), -0.05, 0.1)), Vector((s * (w / 2 - 0.05), -0.47, 0.1)), 0.016, rm, segs=6)
        mb.seg(Vector((s * (w / 2 - 0.05), -0.05, 0.5)), Vector((s * (w / 2 - 0.05), -0.47, 0.5)), 0.022, rm, segs=6)
        mb.seg(Vector((s * (w / 2 - 0.05), -0.47, 0.1)), Vector((s * (w / 2 - 0.05), -0.47, 0.5)), 0.016, rm, segs=6)
    mb.seg(Vector((-w / 2 + 0.05, -0.47, 0.5)), Vector((w / 2 - 0.05, -0.47, 0.5)), 0.026, rm, segs=6)
    objs.append(mb.done(name + '_rail'))
    objs.append(L.snow_slab(name + '_sn', w - 0.1, 0.06, 0.035, (0, -0.47, 0.52), seed=seed))
    if plants:
        rnd = L.rng(seed)
        x = rnd.uniform(-w * 0.3, w * 0.3)
        objs.append(cyl(name + '_pot', 0.08, 0.12, (x, -0.22, 0.1), mat=flat('#B4593F', 0.7), r_top=0.1, segs=12))
        objs.append(sphere(name + '_pl', 0.1, (x, -0.22, 0.28), flat('#3E7F55', 0.8), segs=10, rings=6))
        objs.append(sphere(name + '_fl', 0.04, (x + 0.04, -0.28, 0.34), flat(['#E8524A', '#F2C14E', '#F28DB2'][seed % 3],
                                                                             0.5), segs=8, rings=6))
        objs.append(LA.snow_drift(name + '_sd', 0.12, (-x * 0.6, -0.25, 0.1), seed=seed, scale=(1.4, 1.0, 0.4)))
    return T.face_group(objs, face, loc, name)


APT_A_NOTE = ('Apartment A (4.2 x 3.4 m): chunky four-storey red-brick block with cream bands, white balconies with '
              'flower pots on the front, rows of warm windows, a flat snowy roof with a water tank, chimney stacks '
              'and an antenna, entrance with a canopy, mailboxes and a bike. Home for ~8 households. doorPoint = '
              'entrance steps, fxPoints.smoke (two chimneys), staffPoints = the caretaker sweeping snow.')


@town('apartment_a', 'building', 'town_homes', fp=(4.2, 3.4), catcher=30.0, notes=APT_A_NOTE, ko='아파트 A',
      en='Apartment A', zone='homes')
def b_apartment_a():
    W, D, X, Y = 3.7, 2.8, 0.0, 0.2
    x0, x1, y0, y1 = X - W / 2, X + W / 2, Y - D / 2, Y + D / 2
    PL, ST, NS = 0.25, 1.45, 4
    H = PL + NS * ST
    brick = L.brick('#C2694F', '#A95A43', '#E8DCCB', scale=3.0, row_h=0.4, snow_top=False)
    cream = '#F3E6C8'
    T.plinth('plinth', W, D, h=PL, col='#8E96A3', x=X, y=Y)
    box('walls', (W, D, H - PL), (X, Y, PL), mat=brick, bevel=0.05)
    T.corner_trims('ctrim', W, D, PL, H - PL, cream, x=X, y=Y, t=0.18)
    for k in range(1, NS):
        T.band('band%d' % k, W, D, PL + k * ST - 0.05, cream, h=0.1, x=X, y=Y, snow=True, seed=220 + k)
    T.flat_roof('roof', W, D, H, col=cream, parapet=0.3, x=X, y=Y, seed=225)
    # windows + balconies on the front, windows on the right side
    xs = [x0 + 0.55, X - 0.45, X + 0.45, x1 - 0.55]
    for f in range(NS):
        zt = PL + f * ST + 1.12
        for k, x in enumerate(xs):
            if f == 0 and k in (1, 2):
                continue
            T.win('w%d_%d' % (f, k), (x, y0, zt), 'y-', w=0.48, h=0.62, shutters=None, seed=230 + f * 4 + k)
        if f > 0:
            for k, x in enumerate((x0 + 0.55, x1 - 0.55)):
                balcony('bal%d_%d' % (f, k), (x, y0, PL + f * ST - 0.02), 'y-', w=0.95, seed=f * 2 + k)
        for k, y in enumerate((Y - 0.6, Y + 0.6)):
            T.win('s%d_%d' % (f, k), (x1, y, zt), 'x+', w=0.48, h=0.62, shutters=None, seed=250 + f * 2 + k)
    T.door('door', (X, y0, PL), 'y-', w=0.9, h=1.38, col='#3E8E57', frame_col=cream, double=True, step_depth=0.42,
           canopy=(0.65, PL + 1.62), canopy_col='#3E8E57')
    box('mailbox', (0.4, 0.12, 0.3), (X + 0.82, y0 - 0.06, PL + 0.7), mat=flat('#B9C2CE', 0.3, 0.6), bevel=0.02)
    for k in range(4):
        box('mbslot', (0.08, 0.02, 0.05), (X + 0.68 + 0.09 * k, y0 - 0.125, PL + 0.85), mat=flat('#3D424C', 0.5),
            bevel=0.0)
    # roof: water tank + chimneys + antenna
    tk = H + 0.16
    cyl('tank', 0.38, 0.6, (X - 0.7, Y + 0.45, tk + 0.3), mat=L.stripes('#C98F55', '#B27843', 10.0, 'Z', soft=0.04),
        segs=24, bevel=0.03)
    for lx in (-0.25, 0.25):
        for ly in (-0.25, 0.25):
            cyl('tleg', 0.03, 0.32, (X - 0.7 + lx, Y + 0.45 + ly, tk), mat=flat('#3D424C', 0.5), segs=8)
    cyl('tcap', 0.42, 0.22, (X - 0.7, Y + 0.45, tk + 0.9), mat=flat('#5E4A3A', 0.7), segs=24, r_top=0.05)
    PA.snow_cap('tsnow', 0.3, (X - 0.7, Y + 0.45, tk + 1.02), 0.08, 3)
    _, sm1 = T.chimney('chim1', x1 - 0.5, Y + 0.6, H, H + 0.85, col='#A95A43', w=0.4)
    _, sm2 = T.chimney('chim2', X + 0.3, Y + 0.9, H, H + 0.7, col='#A95A43', w=0.34)
    mb = L.MB()
    am = flat('#B9C2CE', 0.3, 0.7)
    mb.seg(Vector((X + 0.9, Y - 0.3, tk)), Vector((X + 0.9, Y - 0.3, tk + 1.1)), 0.02, am, segs=6)
    for z, w in ((tk + 0.85, 0.35), (tk + 1.0, 0.25)):
        mb.seg(Vector((X + 0.9 - w, Y - 0.3 - w, z)), Vector((X + 0.9 + w, Y - 0.3 + w, z)), 0.015, am, segs=6)
    mb.done('antenna')
    T.flower_tub('tub1', (X - 0.75, y0 - 0.55, 0.0), r=0.2, evergreen=True, seed=22)
    T.flower_tub('tub2', (X + 0.75, y0 - 0.55, 0.0), r=0.2, evergreen=True, seed=23)
    LA.snow_drift('d1', 0.3, (x1 + 0.3, y1 + 0.1, 0.0), seed=226)
    LA.snow_drift('d2', 0.25, (x0 - 0.15, y0 - 0.35, 0.0), seed=227)
    mark('door', (X, y0 - 0.95, 0.0), facing=(0, 1, 0))
    mark('staff', (X + 1.3, y0 - 0.75, 0.0), facing=(-0.3, -1, 0))
    return {'fx': {'smoke': sm1, 'smoke2': sm2}}


APT_B_NOTE = ('Apartment B (4.2 x 3.2 m): three-storey pastel-blue house-block with white trim and balconies, a steep '
              'dark-blue gable roof with two dormers and a big round attic window, a green front door under a '
              'canopy, a bench and lamp in front. Home for ~6 households. doorPoint, fxPoints.smoke.')


@town('apartment_b', 'building', 'town_homes', fp=(4.2, 3.2), catcher=30.0, notes=APT_B_NOTE, ko='아파트 B',
      en='Apartment B', zone='homes')
def b_apartment_b():
    W, D, X, Y = 3.6, 2.5, 0.0, 0.25
    x0, x1, y0, y1 = X - W / 2, X + W / 2, Y - D / 2, Y + D / 2
    PL, ST, NS = 0.22, 1.45, 3
    H = PL + NS * ST
    col = '#A9C8E8'
    trim = T.TRIM_WHITE
    T.plinth('plinth', W, D, h=PL, x=X, y=Y)
    box('walls', (W, D, H - PL), (X, Y, PL), mat=T.plaster(col), bevel=0.05)
    T.corner_trims('ctrim', W, D, PL, H - PL, trim, x=X, y=Y, t=0.16)
    for k in range(1, NS):
        T.band('band%d' % k, W, D, PL + k * ST - 0.05, trim, h=0.09, x=X, y=Y, snow=True, seed=260 + k)
    T.band('cornice', W, D, H - 0.12, trim, h=0.14, out=0.07, x=X, y=Y)
    ridge = H + 1.6
    T.gable('roof', W, D, H, ridge, 0.34, '#33507A', T.plaster(col), seed=262, x=X, y=Y)
    xs = [x0 + 0.5, X - 0.6, X + 0.6, x1 - 0.5]
    for f in range(NS):
        zt = PL + f * ST + 1.12
        for k, x in enumerate(xs):
            if f == 0 and k == 1:
                continue
            T.win('w%d_%d' % (f, k), (x, y0, zt), 'y-', w=0.46, h=0.6, shutters='#33507A', seed=270 + f * 4 + k)
        if f > 0:
            balcony('bal%d' % f, (X + 0.6, y0, PL + f * ST - 0.02), 'y-', w=0.95, col=trim, rail=trim, seed=10 + f)
        T.win('s%d' % f, (x1, Y, zt), 'x+', w=0.5, h=0.6, shutters='#33507A', seed=290 + f)
    T.win('gwin', (x1 + 0.03, Y, H + 0.8), 'x+', w=0.5, round_=True, seed=294)
    # dormers on the front slope
    for k, dx in enumerate((-0.85, 0.85)):
        dy = y0 + 0.45
        dz = H + 0.45
        box('dorm%d' % k, (0.62, 0.6, 0.62), (X + dx, dy + 0.15, dz), mat=T.plaster(col), bevel=0.03)
        T.win('dw%d' % k, (X + dx, dy - 0.15, dz + 0.52), 'y-', w=0.36, h=0.36, shutters=None, seed=295 + k)
        T.gable('dr%d' % k, 0.62, 0.75, dz + 0.6, dz + 0.95, 0.08, '#33507A', T.plaster(col), seed=296 + k,
                x=X + dx, y=dy + 0.12, along='y', snow_frac=(0.8, 0.8))
    T.door('door', (X - 0.6, y0, PL), 'y-', w=0.8, h=1.38, col='#3E8E57', frame_col=trim, step_depth=0.4,
           canopy=(0.6, PL + 1.62), canopy_col='#33507A')
    _, sm = T.chimney('chim', x0 + 0.55, Y + 0.6, H + 0.6, ridge + 0.3, col='#B4593F')
    T.town_bench('bench', (X + 0.75, y0 - 0.8, 0.0), rot_z=0.0)
    T.street_lamp('lamp', (x0 + 0.15, y0 - 0.6, 0.0), h=2.2)
    LA.snow_drift('d1', 0.28, (x1 + 0.3, y1 + 0.1, 0.0), seed=297)
    mark('door', (X - 0.6, y0 - 0.95, 0.0), facing=(0, 1, 0))
    mark('seat', (X + 0.5, y0 - 0.8, 0.0), facing=(0, -1, 0))
    mark('seat', (X + 1.0, y0 - 0.8, 0.0), facing=(0, -1, 0))
    return {'fx': {'smoke': sm}}


# =========================================================================== TOWNHOUSES

TH_NOTE = ('Townhouse %s (2.6 x 2.6 m): %s. Home for one family; doorPoint = in front of the door, fxPoints.smoke = '
           'chimney top (game smoke).')


def townhouse(seed, col, roof, along, door_col, shutters, extra=None, W=2.2, D=2.1, wall_mat=None, chimney='#B4593F',
              porch=False, bay=False):
    S = shop_house(W=W, D=D, col=col, roof=roof, roof_along=along, seed=seed, shutters=shutters, chimney=chimney,
                   wall_mat=wall_mat, x=-0.05, y=0.15)
    x0, x1, y0, PL = S['x0'], S['x1'], S['y0'], S['PL']
    if bay:
        def display(objs):
            objs.append(cyl('vase', 0.06, 0.16, (0.0, -0.12, 0.0), mat=flat('#3D7CC9', 0.3), segs=12, r_top=0.04))
            for k in range(4):
                objs.append(sphere('fl', 0.05, (-0.05 + 0.035 * k, -0.12, 0.2 + 0.03 * (k % 2)),
                                   flat(['#E8524A', '#F2C14E', '#F28DB2', '#F4F1EA'][k], 0.5), segs=8, rings=6))
        T.shop_window('bay', (x0 + 0.6, y0, PL + 0.35), 'y-', w=0.8, h=0.8, frame_col=T.TRIM_WHITE, display=display,
                      mullions=1, depth=0.3, back_col='#FFE2A0')
    else:
        T.win('fw', (x0 + 0.6, y0, PL + 1.15), 'y-', w=0.55, h=0.62, shutters=shutters, seed=seed + 5)
        box('fbox', (0.66, 0.18, 0.14), (x0 + 0.6, y0 - 0.1, PL + 0.4), mat=flat('#A86A36', 0.8), bevel=0.03)
        for k in range(5):
            sphere('fbl', 0.055, (x0 + 0.4 + 0.1 * k, y0 - 0.1, PL + 0.58), flat(['#E8524A', '#F2C14E'][k % 2], 0.5),
                   segs=8, rings=6)
    T.door('door', (x1 - 0.55, y0, PL), 'y-', w=0.66, h=1.32, col=door_col, frame_col=T.TRIM_WHITE, step_depth=0.36,
           wreath=True, canopy=(0.5, PL + 1.6) if not porch else None, canopy_col=roof)
    if porch:
        for s in (-1, 1):
            cyl('ppost', 0.06, 1.65, (x1 - 0.55 + s * 0.48, y0 - 0.62, 0.0), mat=flat(T.TRIM_WHITE, 0.6), segs=12)
        box('pdeck', (1.2, 0.75, 0.16), (x1 - 0.55, y0 - 0.36, 0.0), mat=L.stripes('#C98F55', '#B27843', 6.0, 'X'),
            bevel=0.02)
        LA.roof('proof', 1.3, y0 - 0.8, 1.68, y0, 1.95, 0.06, L.stripes(roof, hexmix(roof, '#000000', 0.12), 5.0, 'Y'),
                snow_frac=0.85, seed=seed + 9)
    T.lamp_wall('lamp', (x1 - 0.12, y0, PL + 1.45), 'y-')
    if extra:
        extra(S)
    mark('door', (x1 - 0.55, y0 - 0.85, 0.0), facing=(0, 1, 0))
    return {'fx': {'smoke': S['smoke']}}


@town('townhouse_a', 'building', 'town_homes', fp=(2.6, 2.6), notes=TH_NOTE % ('A', 'butter-yellow plaster, red roof '
      'with its gable to the street, round attic window, green door with a wreath, flower box'), ko='주택 A',
      en='Townhouse A', zone='homes')
def b_townhouse_a():
    def extra(S):
        T.flower_tub('tub', (S['x0'] - 0.1, S['y0'] - 0.3, 0.0), r=0.18, evergreen=True, seed=31)
        LA.snow_drift('d1', 0.22, (S['x1'] + 0.25, S['y'] + 0.8, 0.0), seed=301)
    return townhouse(300, '#F6DD8A', '#C8473A', 'y', '#3E8E57', '#3E8E57', extra)


@town('townhouse_b', 'building', 'town_homes', fp=(2.6, 2.6), notes=TH_NOTE % ('B', 'mint clapboard house with a '
      'dark-blue roof along the street, a front porch on two posts, white trim, snowman in the garden'), ko='주택 B',
      en='Townhouse B', zone='homes')
def b_townhouse_b():
    clap = L.stripes('#A8DCCB', '#97CCBA', 4.6, 'Z', rough=0.8, soft=0.05)

    def extra(S):
        with L.Collect() as sc_:
            LA.snowball('sm1', 0.2, (0, 0, 0.18), seed=7)
            LA.snowball('sm2', 0.15, (0, 0, 0.46), seed=8)
            cyl('smnose', 0.02, 0.1, (0.02, -0.11, 0.48), rot=(90, 0, 20), mat=flat('#F08A3A', 0.5), segs=8, r_top=0.0)
            cyl('smhat', 0.08, 0.1, (0, 0, 0.58), mat=flat('#33507A', 0.6), segs=12, r_top=0.06)
        L.group(BA.top_level(sc_.objs), 'snowman', loc=(S['x0'] + 0.1, S['y0'] - 0.55, 0))
        LA.snow_drift('d1', 0.22, (S['x1'] + 0.25, S['y'] + 0.8, 0.0), seed=311)
    return townhouse(310, '#A8DCCB', '#33507A', 'x', '#D9483B', '#33507A', extra, wall_mat=clap, porch=True)


@town('townhouse_c', 'building', 'town_homes', fp=(2.6, 2.6), notes=TH_NOTE % ('C', 'coral-pink plaster with a brown '
      'gable roof to the street, a lit bay window with flowers, tall brick chimney, a little fence'), ko='주택 C',
      en='Townhouse C', zone='homes')
def b_townhouse_c():
    def extra(S):
        T.picket_fence('fence', (S['x0'] - 0.25, S['y0'] - 0.7), (S['x0'] + 1.0, S['y0'] - 0.7), h=0.5, seed=3)
        LA.snow_drift('d1', 0.22, (S['x1'] + 0.25, S['y'] + 0.8, 0.0), seed=321)
    return townhouse(320, '#F2B5A6', '#7A4A2A', 'y', '#33507A', '#7A4A2A', extra, bay=True)


@town('townhouse_d', 'building', 'town_homes', fp=(2.6, 2.6), notes=TH_NOTE % ('D', 'sky-blue painted wood house with a '
      'steep red roof along the street, white shutters, a red door under a canopy, firewood stack'), ko='주택 D',
      en='Townhouse D', zone='homes')
def b_townhouse_d():
    wood = L.stripes('#8FB6DA', '#7FA6CA', 4.6, 'Z', rough=0.8, soft=0.05)

    def extra(S):
        PA.log_pile('fw', 3, 0.09, 0.55, (S['x1'] + 0.35, S['y'] + 0.4, 0), seed=33)
        LA.snow_drift('d1', 0.22, (S['x0'] - 0.15, S['y0'] - 0.3, 0.0), seed=331)
    return townhouse(330, '#8FB6DA', '#C8473A', 'x', '#D9483B', '#F4F1EA', extra, wall_mat=wood)


# =========================================================================== PARK FOUNTAIN

FOUNT_NOTE = ('Park fountain (3 x 3 m): round stone basin with a snowy rim, a two-tier fountain with a pinecone on '
              'top; anims.work / anims.water = 4-frame water loop (jets arcing from the top, water sheets falling from '
              'the bowls, ripple rings spreading on the basin). seatPoints = people sitting on the rim, gatherPoints '
              'around it, fxPoints.splash / top.')


def water_mat(name, alpha=0.85):
    m = L.emissive(name, '#8FD0F2', '#BFE6FA', 0.35, rough=0.08)
    L.set_alpha(m, alpha)
    return m


@town('park_fountain', 'decor', 'town_park', fp=(3.0, 3.0), yaw=45.0, front='S', work=4, fps=8, notes=FOUNT_NOTE,
      ko='공원 분수', en='Park fountain', zone='park', anim_name='water', samples=48)
def b_park_fountain():
    R = 1.25
    stone = snowy('#A9B0BB', lo=0.7, hi=0.9)
    with L.Collect():
        PA.round_stone_ring(R, 22, seed=5, size=0.2, z=0.0, cols=('#A9B0BB', '#9AA2AD', '#B5BBC5'))
    # basin wall (revolved ring) + rim
    def prof(j, k):
        M = 48
        th = math.tau * j / M
        rows = [(R - 0.12, 0.0), (R + 0.06, 0.0), (R + 0.1, 0.38), (R + 0.02, 0.46), (R - 0.14, 0.46), (R - 0.18, 0.38),
                (R - 0.18, 0.1)]
        r, z = rows[k]
        return (r * math.cos(th), r * math.sin(th), z)
    L.revolve('basin', prof, 48, 7, mat=stone, smooth=True)
    cyl('bfloor', R - 0.15, 0.1, (0, 0, 0), mat=flat('#6E8FA8', 0.6), segs=48, bevel=0.0)
    cyl('water', R - 0.16, 0.04, (0, 0, 0.28), mat=water_mat('bw', 0.8), segs=48, bevel=0.0)
    for k in range(6):
        a = math.tau * k / 6 + 0.3
        PA.snow_cap('rimsnow', 0.22, ((R - 0.05) * math.cos(a), (R - 0.05) * math.sin(a), 0.47), 0.06, 10 + k,
                    scale=(1.2, 0.6, 1.0))
    # central column + two bowls
    cyl('col', 0.16, 1.5, (0, 0, 0.1), mat=flat('#B5BBC5', 0.6), segs=20, r_top=0.11, bevel=0.03)
    def bowl(name, r, z, h=0.18):
        def bp(j, k):
            M = 36
            th = math.tau * j / M
            rows = [(0.12, -h), (r * 0.7, -h * 0.7), (r, 0.0), (r - 0.05, 0.03), (r * 0.6, -h * 0.35), (0.1, -h * 0.4)]
            rr, zz = rows[k]
            return (rr * math.cos(th), rr * math.sin(th), z + zz)
        return L.revolve(name, bp, 36, 6, mat=snowy('#C3C9D2', lo=0.75, hi=0.95), smooth=True)
    bowl('bowl1', 0.72, 1.0, 0.22)
    cyl('bw1', 0.64, 0.03, (0, 0, 0.94), mat=water_mat('bw1', 0.85), segs=36, bevel=0.0)
    cyl('col2', 0.09, 0.5, (0, 0, 1.0), mat=flat('#B5BBC5', 0.6), segs=16, r_top=0.07)
    bowl('bowl2', 0.4, 1.55, 0.14)
    cyl('bw2', 0.34, 0.03, (0, 0, 1.51), mat=water_mat('bw2', 0.85), segs=28, bevel=0.0)
    with L.Collect() as pc:
        T.em_pinecone(0.45)
    L.group(BA.top_level(pc.objs), 'cone', loc=(0, 0, 1.82))
    # animated water: jets from the top, falling sheets from both bowls, ripple rings
    wm = water_mat('wj', 0.9)
    drops = L.Spray('jet', (0, 0, 2.0), (0.0, 0.0, 1.2), wm, n=16, grav=1.6, r=0.045, spread=0.55, seed=6)
    sheets = []
    for k in range(12):
        a = math.tau * k / 12
        for j, (r, z0, z1) in enumerate(((0.72, 1.0, 0.32), (0.4, 1.55, 1.0))):
            o = cyl('sheet%d_%d' % (j, k), 0.035, z0 - z1, (r * math.cos(a), r * math.sin(a), z1), mat=wm, segs=8,
                    bevel=0.0)
            o.visible_shadow = False
            sheets.append((o, j, k))
    rings = []
    for k in range(3):
        mb = L.MB()
        T.ring_seg(mb, (0, 0, 0.0), 1.0, 0.012, flat('#E6F6FF', 0.2), axis='z', n=40, segs=5)
        o = mb.done('ripple%d' % k)
        o.location.z = 0.31
        o.visible_shadow = False
        rings.append(o)
    drip = []
    for k in range(10):
        a = math.tau * k / 10 + 0.2
        o = sphere('drip%d' % k, 0.04, (0.72 * math.cos(a), 0.72 * math.sin(a), 0.6), wm, segs=8, rings=6)
        o.visible_shadow = False
        drip.append((o, a))
    T.town_bench('benchL', (-1.6, -0.6, 0.0), rot_z=-60)
    for k, (bx, by) in enumerate(((1.35, -1.25), (-1.2, 1.3))):
        T.flower_tub('tub%d' % k, (bx, by, 0.0), r=0.2, evergreen=True, seed=40 + k)

    def idle():
        drops.show(False)
        for o, j, k in sheets:
            o.hide_render = True
        for o in rings:
            o.hide_render = True
        for o, a in drip:
            o.hide_render = True

    def work(i):
        drops.set(i)
        for o, j, k in sheets:
            o.hide_render = False
            o.scale = (1.0 + 0.25 * math.sin(math.tau * (i / 4.0 + k / 3.0)), 1.0, 1.0)
        for k, o in enumerate(rings):
            o.hide_render = False
            t = ((k + i / 4.0) / 3.0) % 1.0
            r = 0.25 + 0.75 * t
            o.scale = (r, r, 1.0)
        for k, (o, a) in enumerate(drip):
            o.hide_render = False
            t = ((k / 10.0) + i / 4.0) % 1.0
            rr = 0.72 + 0.12 * t
            o.location = (rr * math.cos(a), rr * math.sin(a), 0.95 - 0.62 * t * t)
    idle()
    for k in range(6):
        a = math.tau * k / 6 + 0.5
        mark('seat', ((R + 0.12) * math.cos(a), (R + 0.12) * math.sin(a), 0.0), facing=(math.cos(a), math.sin(a), 0))
    for k in range(4):
        a = math.tau * k / 4 + 0.8
        mark('gather', ((R + 0.65) * math.cos(a), (R + 0.65) * math.sin(a), 0.0), facing=(-math.cos(a), -math.sin(a), 0))
    return {'idle': idle, 'work': work, 'fx': {'splash': (0, 0, 0.32), 'top': (0, 0, 2.1)}}


# =========================================================================== PLAYGROUND

PLAY_NOTE = ('Playground set (4 x 3 m): a little tower with a red pointed roof, a ladder and a yellow slide, a '
             'seesaw, a spring-rider horse and a snowy sandbox. playPoints/playDirs = where kids play (slide top, '
             'slide end, seesaw seats, spring rider, sandbox).')


@town('playground', 'decor', 'town_park', fp=(4.0, 3.0), notes=PLAY_NOTE, ko='놀이터', en='Playground', zone='park')
def b_playground():
    # soft rubber floor patches
    box('mat1', (2.0, 1.6, 0.03), (-0.9, 0.5, 0.0), mat=tonal('#E08A6A', 0.06, 2.0, rough=0.9), bevel=0.02)
    box('mat2', (1.8, 1.3, 0.03), (1.0, -0.55, 0.0), mat=tonal('#7FB6D9', 0.06, 2.0, rough=0.9), bevel=0.02)
    # tower + slide
    tx, ty = -1.2, 0.6
    post = flat('#F2C14E', 0.45)
    for sx in (-1, 1):
        for sy in (-1, 1):
            cyl('tp', 0.05, 2.1, (tx + sx * 0.4, ty + sy * 0.4, 0), mat=post, segs=10)
    box('tdeck', (0.95, 0.95, 0.08), (tx, ty, 1.0), mat=flat('#3D7CC9', 0.5), bevel=0.02)
    for sx, sy, sz in ((0.0, 0.42, 0.0), (-0.42, 0.0, 90)):
        box('tpanel', (0.8, 0.05, 0.45), (tx + sx, ty + sy, 1.08), rot=(0, 0, sz), mat=flat('#5CB85C', 0.5),
            bevel=0.02)
    T.hip_cap('troof', 1.05, 1.05, 2.05, 0.65, '#D9483B', seed=7, x=tx, y=ty)
    lad = flat('#F4F1EA', 0.5)
    mb = L.MB()
    for s in (-1, 1):
        mb.seg(Vector((tx + s * 0.22, ty + 0.95, 0.0)), Vector((tx + s * 0.22, ty + 0.45, 1.05)), 0.03, lad, segs=8)
    for k in range(1, 5):
        t = k / 5
        mb.seg(Vector((tx - 0.22, ty + 0.95 - 0.5 * t, 1.05 * t)), Vector((tx + 0.22, ty + 0.95 - 0.5 * t, 1.05 * t)),
               0.025, lad, segs=6)
    mb.done('ladder')
    sl = flat('#F2C14E', 0.3)
    n = 10
    pts = []
    for k in range(n + 1):
        t = k / n
        pts.append((tx + 0.45 + 1.25 * t, ty - 0.1 * t, 1.04 - 0.95 * (3 * t * t - 2 * t * t * t) + 0.05))
    for k in range(n):
        p, q = Vector(pts[k]), Vector(pts[k + 1])
        d = q - p
        ang = math.degrees(math.atan2(d.z, math.hypot(d.x, d.y)))
        box('slide', (d.length + 0.02, 0.5, 0.05), tuple((p + q) / 2), rot=(0, -ang, 0), mat=sl, bevel=0.01,
            origin='center')
        for s in (-1, 1):
            box('slip', (d.length + 0.02, 0.05, 0.12), tuple((p + q) / 2 + Vector((0, s * 0.26, 0.05))), rot=(0, -ang, 0),
                mat=flat('#F08A3A', 0.3), bevel=0.01, origin='center')
    L.snow_slab('tsnow', 0.6, 0.6, 0.05, (tx, ty, 1.08), seed=4)
    # seesaw
    sx_, sy_ = 0.9, 0.85
    box('ssbase', (0.2, 0.3, 0.32), (sx_, sy_, 0.0), mat=flat('#3D7CC9', 0.5), bevel=0.04, taper=(0.6, 0.8))
    box('ssboard', (1.8, 0.2, 0.06), (sx_, sy_, 0.38), rot=(0, 10, 0), mat=flat('#D9483B', 0.45), bevel=0.02,
        origin='center')
    for s in (-1, 1):
        x = sx_ + s * 0.75
        z = 0.38 - s * 0.75 * math.sin(math.radians(10))
        cyl('ssh', 0.02, 0.18, (x, sy_ - 0.12, z), rot=(0, 0, 0), mat=flat('#F4F1EA', 0.4), segs=6)
        box('ssh2', (0.03, 0.26, 0.03), (x, sy_, z + 0.18), mat=flat('#F4F1EA', 0.4), bevel=0.0)
        box('sseat', (0.24, 0.24, 0.05), (x - s * 0.1, sy_, z + 0.04), mat=flat('#F2C14E', 0.45), bevel=0.02)
    # spring rider horse
    hx, hy = 1.35, -0.6
    mb = L.MB()
    for k in range(10):
        a = k * 1.2
        mb.seg(Vector((hx + 0.07 * math.cos(a), hy + 0.07 * math.sin(a), 0.03 * k)),
               Vector((hx + 0.07 * math.cos(a + 1.2), hy + 0.07 * math.sin(a + 1.2), 0.03 * (k + 1))), 0.015,
               flat('#B9C2CE', 0.3, 0.7), segs=5)
    mb.done('spring')
    box('hbody', (0.5, 0.22, 0.24), (hx, hy, 0.32), mat=flat('#F4F1EA', 0.45), bevel=0.08)
    sphere('hhead', 0.12, (hx - 0.28, hy, 0.62), flat('#F4F1EA', 0.45), scale=(1.3, 0.8, 1.0), segs=14, rings=8)
    box('hneck', (0.12, 0.14, 0.22), (hx - 0.2, hy, 0.48), rot=(0, 30, 0), mat=flat('#F4F1EA', 0.45), bevel=0.04,
        origin='center')
    box('hmane', (0.05, 0.06, 0.24), (hx - 0.17, hy, 0.6), rot=(0, 30, 0), mat=flat('#E8749A', 0.6), bevel=0.02,
        origin='center')
    box('hsaddle', (0.18, 0.24, 0.05), (hx + 0.02, hy, 0.56), mat=flat('#D9483B', 0.5), bevel=0.02)
    for s in (-1, 1):
        sphere('heye', 0.02, (hx - 0.36, hy + s * 0.08, 0.66), flat('#2B2F3A', 0.4), segs=8, rings=6)
    # sandbox with snow
    bx, by = -0.15, -0.75
    for s in (-1, 1):
        box('sbx', (1.2, 0.1, 0.2), (bx, by + s * 0.5, 0.0), mat=flat('#C98F55', 0.7), bevel=0.02)
        box('sby', (0.1, 1.0, 0.2), (bx + s * 0.6, by, 0.0), mat=flat('#C98F55', 0.7), bevel=0.02)
    box('sand', (1.1, 0.9, 0.12), (bx, by, 0.0), mat=snowy('#E2C48A', lo=0.6, hi=0.9, noise_amt=0.6), bevel=0.02)
    LA.snowball('sb1', 0.12, (bx - 0.2, by + 0.1, 0.22), seed=3)
    LA.snowball('sb2', 0.09, (bx - 0.2, by + 0.1, 0.39), seed=4)
    cyl('pail', 0.08, 0.12, (bx + 0.25, by - 0.15, 0.12), mat=flat('#3D7CC9', 0.4), segs=12, r_top=0.1)
    mark('play', (tx + 0.0, ty - 0.75, 0.0), facing=(0, 1, 0))
    mark('play', (tx + 1.85, ty - 0.2, 0.0), facing=(1, 0, 0))
    mark('play', (sx_ - 0.85, sy_ - 0.35, 0.0), facing=(1, 0, 0))
    mark('play', (sx_ + 0.85, sy_ - 0.35, 0.0), facing=(-1, 0, 0))
    mark('play', (hx + 0.1, hy - 0.4, 0.0), facing=(-1, 0, 0))
    mark('play', (bx, by - 0.7, 0.0), facing=(0, 1, 0))
    return {'fx': {'slide': (tx + 1.7, ty - 0.1, 0.2)}}


# =========================================================================== TRAIN STATION

STATION_NOTE = ('Snow-train station (7.2 x 4.4 m): cosy timber station house with a red roof, a big clock on the '
                'gable, a ticket window and a bell; in front (screen down-left) a 7 m stone platform with a yellow '
                'edge line, a canopy on posts, benches, a luggage cart, a station lamp and a blank name board on two '
                'posts. The track is NOT part of this sprite: lay rail_x tiles with their anchors on trackPoint + k * '
                '(64, 32) px; the train stops with its cars on trainStops (engine heading +X / SE). boardPoints = '
                'where passengers step on / off (platform edge), waitPoints = people waiting, seatPoints = benches, '
                'doorPoint = station door, staffPoints = station master with a flag.')


@town('train_station', 'building', 'town_civic', fp=(7.2, 4.4), catcher=34.0, notes=STATION_NOTE, ko='눈썰매 기차역',
      en='Snow-train station', zone='transport', extra={'trackAxis': 'x'})
def b_train_station():
    # platform: x in [-3.6, 3.6], y in [-2.2, -0.75]; track centre line at y = TRACK_Y
    PX0, PX1, PY0, PY1, PZ = -3.6, 3.6, -2.2, -0.7, 0.32
    TRACK_Y = PY0 - 0.68
    stone = snowy('#B5B9C1', lo=0.85, hi=1.05, noise_amt=0.5)
    box('platform', (PX1 - PX0, PY1 - PY0, PZ), ((PX0 + PX1) / 2, (PY0 + PY1) / 2, 0), mat=tiles_mat('#B9BDC6',
                                                                                                   '#AAAFB9', 5.0),
        bevel=0.03)
    box('pedge', (PX1 - PX0 + 0.02, 0.22, PZ + 0.02), ((PX0 + PX1) / 2, PY0 + 0.1, 0), mat=flat('#E8E4DC', 0.7),
        bevel=0.02)
    box('pline', (PX1 - PX0 - 0.1, 0.08, 0.01), ((PX0 + PX1) / 2, PY0 + 0.32, PZ), mat=flat('#F2C14E', 0.5),
        bevel=0.0)
    for k, (x, r) in enumerate(((-3.2, 0.25), (-0.4, 0.2), (2.9, 0.28), (1.2, 0.16))):
        LA.snow_drift('psn%d' % k, r, (x, PY1 - 0.15, PZ), seed=340 + k, scale=(1.6, 0.8, 0.3))
    # station house behind the platform
    W, D, X, Y = 4.0, 2.3, -0.4, 0.55
    x0, x1, y0, y1 = X - W / 2, X + W / 2, Y - D / 2, Y + D / 2
    ST = 1.65
    H = PZ + ST + 0.35
    planks = L.stripes('#E8C99A', '#D9B886', 4.4, 'Z', rough=0.8, soft=0.05)
    box('hplinth', (W + 0.1, D + 0.1, PZ), (X, Y, 0), mat=snowy('#8E96A3', lo=0.75, hi=0.9), bevel=0.03)
    box('hwalls', (W, D, H - PZ), (X, Y, PZ), mat=planks, bevel=0.04)
    T.corner_trims('ctrim', W, D, PZ, H - PZ, '#7A4A2A', x=X, y=Y, t=0.16)
    T.band('hband', W, D, H - 0.1, '#7A4A2A', h=0.12, out=0.06, x=X, y=Y)
    ridge = H + 1.35
    T.gable('roof', W, D, H, ridge, 0.4, '#C8473A', planks, seed=345, x=X, y=Y)
    # cross gable with the clock facing the platform
    T.gable('xg', 1.5, 1.0, H - 0.05, H + 1.05, 0.12, '#C8473A', planks, seed=346, x=X, y=y0 - 0.05, along='y',
            snow_frac=(0.7, 0.7))
    with L.Collect() as cc:
        T.em_clock(1.0)
    L.group(BA.top_level(cc.objs), 'clock', loc=(X, y0 - 0.56, H + 0.42))
    T.door('door', (X - 0.9, y0, PZ), 'y-', w=0.8, h=1.42, col='#3E8E57', frame_col='#7A4A2A', step=False,
           double=True)
    # ticket window with a little awning + bell
    T.shop_window('ticket', (X + 0.45, y0, PZ + 0.55), 'y-', w=0.7, h=0.6, frame_col='#7A4A2A', mullions=0)
    box('tsill', (0.9, 0.3, 0.06), (X + 0.45, y0 - 0.15, PZ + 0.55), mat=flat('#8A5A33', 0.7), bevel=0.02)
    T.win('w1', (X + 1.4, y0, PZ + 1.25), 'y-', w=0.5, h=0.6, shutters='#3E8E57', seed=347)
    T.win('w2', (X - 1.65, y0, PZ + 1.25), 'y-', w=0.45, h=0.6, shutters='#3E8E57', seed=348)
    T.win('ws', (x1, Y, PZ + 1.25), 'x+', w=0.55, h=0.6, shutters='#3E8E57', seed=349)
    with L.Collect() as bc_:
        T.bell_model('sbell', s=0.7)
    L.group(BA.top_level(bc_.objs), 'bellg', loc=(X + 1.0, y0 - 0.22, PZ + 1.72))
    box('bellarm', (0.06, 0.3, 0.06), (X + 1.0, y0 - 0.12, PZ + 1.72), mat=flat('#3D424C', 0.4, 0.6), bevel=0.01)
    _, smoke = T.chimney('chim', x0 + 0.6, Y + 0.5, H, ridge + 0.2, col='#8E6A5A')
    # canopy over the platform in front of the house
    cz = PZ + 2.05
    cx0, cx1 = X - 2.1, X + 2.1
    cy0 = PY0 + 0.55
    for x in (cx0 + 0.15, X, cx1 - 0.15):
        cyl('cpost', 0.07, cz - PZ, (x, cy0, PZ), mat=flat('#7A4A2A', 0.7), segs=12)
        box('cbrace', (0.05, 0.5, 0.05), (x, cy0 + 0.22, cz - 0.25), rot=(-40, 0, 0), mat=flat('#7A4A2A', 0.7),
            bevel=0.0, origin='center')
    rm = L.stripes('#C8473A', '#B23A30', 4.5, 'Y', rough=0.75, soft=0.04)
    LA.roof('canopy', cx1 - cx0 + 0.3, cy0 - 0.45, cz - 0.08, y0 + 0.05, cz + 0.45, 0.07, rm, snow_frac=0.75, seed=350)
    # valance (scalloped trim) along the canopy edge
    for k in range(14):
        x = cx0 - 0.1 + (cx1 - cx0 + 0.2) * (k + 0.5) / 14
        cyl('scal', 0.1, 0.04, (x, cy0 - 0.47, cz - 0.12), rot=(90, 0, 0), mat=flat('#F4F1EA', 0.6), segs=12,
            origin='center')
    # hanging lamps under the canopy
    for x in (cx0 + 1.0, cx1 - 1.0):
        PA.lantern('clamp', (x, cy0 - 0.05, cz - 0.55), 0.13, 3.0)
        box('clampc', (0.02, 0.02, 0.3), (x, cy0 - 0.05, cz - 0.32), mat=flat('#3D424C', 0.5), bevel=0.0)
    # benches, luggage cart, name board, station clock post
    T.town_bench('bench1', (X - 1.3, cy0 + 0.1, PZ), rot_z=0.0, col='#8A5A33')
    T.town_bench('bench2', (X + 1.6, cy0 + 0.1, PZ), rot_z=0.0, col='#8A5A33')
    lx, ly = 2.6, PY0 + 0.75
    box('lcart', (0.9, 0.55, 0.08), (lx, ly, PZ + 0.22), mat=flat('#8A5A33', 0.7), bevel=0.02)
    for s in (-1, 1):
        cyl('lwheel', 0.12, 0.05, (lx + s * 0.32, ly - 0.3, PZ + 0.12), rot=(90, 0, 0), mat=flat('#3D424C', 0.5),
            segs=14, origin='center')
    box('lhandle', (0.05, 0.05, 0.6), (lx - 0.47, ly, PZ + 0.3), rot=(0, -25, 0), mat=flat('#3D424C', 0.5), bevel=0.0)
    for k, (dx, dz, w, col) in enumerate(((-0.2, 0.3, 0.45, '#C0473A'), (0.22, 0.3, 0.4, '#3D7CC9'),
                                          (0.0, 0.55, 0.38, '#E2B85A'))):
        box('suit', (w, 0.3, 0.24), (lx + dx, ly, PZ + dz), mat=flat(col, 0.55), bevel=0.04)
        box('suitb', (0.04, 0.31, 0.25), (lx + dx - w * 0.25, ly, PZ + dz - 0.005), mat=flat('#6B4226', 0.6), bevel=0.0)
    PA.snow_cap('lsnow', 0.15, (lx, ly, PZ + 0.8), 0.05, 7)
    # name board (blank) on two posts, facing the track (readable from the camera side)
    nx = -3.0
    for s in (-1, 1):
        cyl('npost', 0.05, 1.7, (nx + s * 0.55, PY0 + 0.45, PZ), mat=flat('#3D424C', 0.4, 0.5), segs=10)
    box('nboard', (1.5, 0.08, 0.42), (nx, PY0 + 0.45, PZ + 1.25), mat=flat('#F4F1EA', 0.6), bevel=0.04)
    box('nframe', (1.6, 0.06, 0.52), (nx, PY0 + 0.49, PZ + 1.2), mat=flat('#2E5E40', 0.6), bevel=0.03)
    box('nstripe', (1.4, 0.09, 0.06), (nx, PY0 + 0.45, PZ + 1.27), mat=flat('#2E5E40', 0.6), bevel=0.0)
    L.snow_slab('nsnow', 1.5, 0.12, 0.05, (nx, PY0 + 0.47, PZ + 1.72), seed=351)
    with L.Collect() as tc:
        T.em_train(0.6)
    L.group(BA.top_level(tc.objs), 'trainicon', loc=(nx, PY0 + 0.39, PZ + 1.92), rot=(0, 0, 0))
    T.street_lamp('plamp', (3.25, PY0 + 0.6, PZ), h=2.5)
    T.flower_tub('tub1', (X - 2.3, y0 - 0.3, PZ), r=0.2, evergreen=True, seed=35)
    # emblem sign on the roof (train) facing the camera
    T.sign_disc('rsign', (X + 1.1, Y, ridge + 0.35), r=0.5, bg='#F4F1EA', rim='#C8473A', emblem=T.em_train, es=1.0,
                tilt=8.0)
    for s in (-1, 1):
        cyl('rsleg', 0.04, 0.4, (X + 1.1 + s * 0.27, Y + s * 0.27, ridge - 0.15), mat=flat('#3D424C', 0.4, 0.6), segs=8)
    LA.snow_drift('d1', 0.3, (x1 + 0.35, y1 + 0.1, 0.0), seed=352)
    # markers
    mark('door', (X - 0.9, y0 - 0.6, PZ), facing=(0, 1, 0))
    mark('staff', (X + 0.1, PY0 + 0.6, PZ), facing=(0, -1, 0))
    mark('track', (0.0, TRACK_Y, 0.0))
    for k, x in enumerate((-2.25, 0.0, 2.35)):
        mark('board', (x, PY0 + 0.38, PZ), facing=(0, -1, 0))
    for k, x in enumerate((-2.0, -0.3, 0.8, 1.9)):
        mark('wait', (x + 0.15 * (k % 2), PY0 + 0.75 + 0.1 * (k % 2), PZ), facing=(0, -1, 0))
    for x in (X - 1.55, X - 1.05, X + 1.35, X + 1.85):
        mark('seat', (x, cy0 + 0.1, PZ), facing=(0, -1, 0))
    for name, x in (('stop_engine', 2.34), ('stop_car_a', 0.0), ('stop_car_b', -2.24)):
        mark(name, (x, TRACK_Y, 0.0))
    return {'fx': {'smoke': smoke, 'bell': (X + 1.0, y0 - 0.22, PZ + 1.6), 'clock': (X, y0 - 0.56, H + 0.42)},
            'extra': {'trainStopsNote': 'trainStops.engine/car_a/car_b = car anchors (track centre line) when the '
                                        'train stands at the platform heading +X (SE); heading -X mirror around '
                                        'trackPoint.',
                      'platformPoly': [iso_px(x, y, PZ) for x, y in ((PX0, PY0), (PX1, PY0), (PX1, PY1), (PX0, PY1))],
                      'platformLiftPx': int(round(PZ * 55.4256)),
                      'platformNote': 'platformPoly = the platform top (px from the anchor, at its height); a '
                                      'character walking on it is drawn platformLiftPx higher than its ground '
                                      'position and above this sprite (all platform points already include the '
                                      'lift).'}}


# =========================================================================== STREET PROPS

LAMP_NOTE = ('Town street light (~2.8 m): black cast-iron post with a fluted base and a glowing lantern head, snow on '
             'the cap. fxPoints.light = lamp centre (night glow sprite).')


@town('streetlight', 'decor', 'town_street', fp=('r', 0.25), catcher=10.0, notes=LAMP_NOTE, ko='가로등',
      en='Street light', zone='street')
def b_streetlight():
    _, lp = T.street_lamp('sl', (0, 0, 0), h=2.8)
    return {'fx': {'light': lp}}


@town('streetlight_double', 'decor', 'town_street', fp=('r', 0.3), catcher=10.0, yaw=0.0,
      notes='Double-headed street light (~2.8 m) for squares and the station: two lanterns on curled arms. '
            'fxPoints.lightA / lightB.', ko='쌍가로등', en='Double street light', zone='street')
def b_streetlight_double():
    T.street_lamp('sl', (0, 0, 0), h=2.8, double=True)
    return {'fx': {'lightA': (0.4, 0.4, 2.55), 'lightB': (-0.4, -0.4, 2.55)}}


BENCH_NOTE = ('Park bench (1.7 m) with wooden slats on cast-iron legs, long axis along world %s, facing %s. '
              'seatPoints/seatDirs = two sitting spots (anchor of a sitting character).')


@town('bench_x', 'decor', 'town_street', fp=(1.8, 0.6), catcher=10.0, notes=BENCH_NOTE % ('X', 'screen down-left (-Y)'),
      ko='벤치', en='Bench', zone='street')
def b_bench_x():
    T.town_bench('b', (0, 0.05, 0), rot_z=0.0)
    for x in (-0.42, 0.42):
        mark('seat', (x, -0.05, 0.0), facing=(0, -1, 0))


@town('bench_y', 'decor', 'town_street', fp=(0.6, 1.8), catcher=10.0, notes=BENCH_NOTE % ('Y', 'screen down-right (+X)'),
      ko='벤치', en='Bench', zone='street')
def b_bench_y():
    T.town_bench('b', (-0.05, 0, 0), rot_z=90.0)
    for y in (-0.42, 0.42):
        mark('seat', (0.05, y, 0.0), facing=(1, 0, 0))


STOP_NOTE = ('Sled-bus stop: a round blue stop sign with a red sled on a pole, a small wooden shelter with a snowy '
             'roof and a bench, a blank timetable board. waitPoints = people waiting (queue toward the sign), '
             'seatPoints = bench, stopPoint = where the sled bus / sled taxi halts.')


@town('sled_stop', 'decor', 'town_street', fp=(2.0, 1.2), catcher=14.0, notes=STOP_NOTE, ko='썰매 정류장',
      en='Sled stop', zone='street')
def b_sled_stop():
    # shelter
    wood = flat('#8A5A33', 0.7)
    for x in (-0.55, 0.55):
        for y in (0.15, 0.55):
            cyl('spost', 0.05, 1.75, (x, y, 0), mat=wood, segs=10)
    box('sback', (1.2, 0.06, 0.9), (0, 0.58, 0.5), mat=L.stripes('#C98F55', '#B27843', 6.0, 'Z', soft=0.04),
        bevel=0.02)
    LA.roof('sroof', 1.45, -0.05, 1.72, 0.8, 1.9, 0.07, L.stripes('#3D7CC9', '#3570B4', 5.0, 'Y'), snow_frac=0.9,
            seed=360)
    T.town_bench('sb', (0, 0.32, 0), rot_z=0.0, col='#C98F55')
    box('tt', (0.4, 0.04, 0.5), (0.3, 0.6, 1.0), mat=flat('#F4F1EA', 0.6), bevel=0.02)
    for k in range(4):
        box('ttl', (0.28, 0.01, 0.03), (0.3, 0.575, 1.38 - 0.1 * k), mat=flat('#9AA3B0', 0.7), bevel=0.0)
    T.post_sign('sign', (0.95, -0.25, 0.0), h=2.3, r=0.36, bg='#3D7CC9', rim='#F4F1EA', emblem=T.em_sled, es=0.85)
    LA.snow_drift('d1', 0.2, (-0.8, -0.3, 0.0), seed=361)
    mark('seat', (-0.35, 0.18, 0.0), facing=(0, -1, 0))
    mark('seat', (0.25, 0.18, 0.0), facing=(0, -1, 0))
    for k in range(3):
        mark('wait', (0.75 - 0.45 * k, -0.55 - 0.1 * k, 0.0), facing=(1, 0.2, 0))
    mark('stop', (0.4, -1.2, 0.0), facing=(1, 0, 0))
    return {'fx': {'sign': (0.95, -0.25, 2.3)}}


GATE_NOTE = ('Town gate of 솔방울 마을: two round stone pillars with golden pinecone finials joined by a wooden arch '
             'beam with a big BLANK sign board (the game writes the town name), lanterns and evergreen garlands. The '
             'road (%s) runs between the pillars (inner gap 3.2 m); the board faces %s. fxPoints.boardCentre = '
             'where to place the name text.')


def gate_builder():
    stone = snowy('#B9B2A6', lo=0.75, hi=0.92)
    G = 1.85
    PH = 3.2
    for s in (-1, 1):
        x = s * G
        cyl('pillar', 0.32, PH, (x, 0, 0), mat=flat('#B9B2A6', 0.8), segs=20, bevel=0.03)
        for k in range(7):
            cyl('pring', 0.33, 0.04, (x, 0, 0.35 + 0.42 * k), mat=flat('#A39C90', 0.8), segs=20, bevel=0.0)
        cyl('pbase', 0.42, 0.3, (x, 0, 0), mat=stone, segs=20, bevel=0.04)
        cyl('pcap', 0.42, 0.16, (x, 0, PH), mat=stone, segs=20, bevel=0.04)
        with L.Collect() as pc:
            T.em_pinecone(1.0)
        L.group(BA.top_level(pc.objs), 'finial', loc=(x, 0, PH + 0.48))
        for o in pc.objs:
            if o.type == 'MESH' and o.name.startswith(('cone', 'core')):
                o.data.materials.clear()
                o.data.materials.append(flat('#E2B33C', 0.3, 0.75))
        PA.lantern('glan', (x + s * -0.05, -0.38, 1.7), 0.14, 3.5)
        box('glarm', (0.04, 0.2, 0.04), (x, -0.28, 2.0), mat=flat('#3D424C', 0.5, 0.5), bevel=0.0)
    # arch beam + board
    beam = tonal('#8A5A33', 0.1, 3.0)
    for z in (2.35, 2.95):
        box('beam', (2 * G + 0.5, 0.22, 0.2), (0, 0, z), mat=beam, bevel=0.04)
        L.snow_slab('bsnow', 2 * G + 0.3, 0.2, 0.06, (0, 0, z + 0.2), seed=int(z * 10))
    box('board', (2.6, 0.12, 0.62), (0, -0.05, 2.38 + 0.0), mat=flat('#F6EBD2', 0.65), bevel=0.05)
    box('bframe', (2.75, 0.1, 0.76), (0, 0.0, 2.31), mat=flat('#5E3A22', 0.7), bevel=0.04)
    for s in (-1, 1):
        box('hang', (0.04, 0.04, 0.2), (s * 1.1, -0.04, 2.95), mat=flat('#3D424C', 0.5), bevel=0.0)
    # evergreen garland swags on the lower beam
    gm1, gm2 = flat('#2E6B4F', 0.8), flat('#3E7F55', 0.8)
    mb = L.MB()
    for sw in range(2):
        xa, xb = (-G + 0.25, -0.05) if sw == 0 else (0.05, G - 0.25)
        for k in range(15):
            t = k / 14
            x = xa + (xb - xa) * t
            z = 2.28 - 0.32 * math.sin(math.pi * t)
            mb.ico(0.07, gm1 if k % 2 else gm2, loc=(x, -0.17, z), subdiv=1)
    mb.done('garland', smooth=False)
    for x in (-G + 0.25, 0.0, G - 0.25):
        sphere('gbow', 0.06, (x, -0.22, 2.3), flat('#D9483B', 0.5), scale=(1.4, 0.6, 1.0), segs=10, rings=6)
    LA.snow_drift('d1', 0.3, (-G - 0.4, 0.3, 0.0), seed=371)
    LA.snow_drift('d2', 0.26, (G + 0.4, -0.3, 0.0), seed=372)
    return {'fx': {'boardCentre': (0, -0.12, 2.69), 'lanternL': (-G, -0.38, 1.8), 'lanternR': (G, -0.38, 1.8)}}


@town('town_gate', 'decor', 'town_street', fp=(4.6, 1.0), catcher=18.0,
      notes=GATE_NOTE % ('along world Y, screen up-right <-> down-left', 'screen down-left (-Y)'), ko='마을 입구 표지',
      en='Town gate', zone='street')
def b_town_gate():
    return gate_builder()


@town('town_gate_x', 'decor', 'town_street', fp=(4.6, 1.0), yaw=90.0, front='+X', catcher=18.0,
      notes=GATE_NOTE % ('along world X, screen up-left <-> down-right', 'screen down-right (+X)'), ko='마을 입구 표지',
      en='Town gate', zone='street')
def b_town_gate_x():
    return gate_builder()
