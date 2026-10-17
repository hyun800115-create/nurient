"""
gb_assets.py - props and items of the 금방 set (docs/CONTRACT_GEUMBANG.md AO.5, AO.6), registered in the spec format
of bld_assets.BLD and rendered by bld_render.render_build() UNCHANGED (same camera / light / PPU / shadow catcher; items
72 x 72 anchored (36, 54), props with a baked soft shadow and a ground anchor).

Props (front -Y; yaw turns it):
  gb_sign      3.2 m pole + a 1 m 금방이 disc facing the camera (mark only)          frames _0 day, _1 lit
  gb_flag      2.4 m pole + a 1.0 x 0.65 m printed 금방 flag (mark only)            frames wave_0..5 (8 fps loop)
  gb_locker_a  1.8 x 0.6 x 2 m parcel locker facing SW: gold cabinet, 4 x 3 navy door insets on a gold grid, a cream
  gb_locker_b  header with the glowing mark screen, a snow cap; the same facing SE   _0 day, _1 lit, open_0..3
               (door OPEN_SLOT swings open; gb_pack cuts open_* into patches over _0)
Items (kind item, atlas gb_bld_0):
  gb_parcel_s/m/l      kraft + gold tape cross + mark sticker (the cardboard_box_s/m/l sizes)
  gb_parcel_doorstep   _0 a parcel on a doormat, _1 the same with a snow cap (after 4 game hours)
  gb_parcel_open       flaps open, empty
  gb_parcel_cat        the open parcel with 나비 (pet_cat) peeking out: _0 eyes open, _1 blink
Not run directly - see gb_render.py.
"""
import math
import os
from collections import OrderedDict

import bpy  # noqa: F401
from mathutils import Vector

import prop_lib as L
from prop_lib import flat, box, cyl, sphere, blob, snowy
import bld_assets as BA
import town_lib as T
import gb_lib as G

GBA = OrderedDict()
TEX = {}
LOCKER = dict(w=1.8, d=0.6, h=2.0, rows=4, cols=3, plinth=0.12, grid0=0.17, grid1=1.49, frame=0.08)
OPEN_SLOT = 7                       # row 2 (from the top), middle column: a comfortable height (index = row * 3 + col)
OPEN_ANG = [22.0, 52.0, 84.0, 108.0]
FLAG_FRAMES = 6
SIZES = {'s': (0.36, 0.3, 0.26), 'm': (0.48, 0.4, 0.34), 'l': (0.62, 0.5, 0.44)}


def gba(key, kind, fp=None, yaw=0.0, shadow=True, samples=48, notes='', front=None, catcher=16.0, item=None,
        extra=None):
    def deco(fn):
        GBA[key] = dict(key=key, fn=fn, kind=kind, atlas='gb_bld_0', fp=fp, yaw=yaw, shadow=shadow and not item,
                        samples=samples, notes=notes, front=front, catcher=catcher, work=0, fps=8, item=item,
                        sprites=None, extra=extra or {})
        return fn
    return deco


def collect(fn):
    with L.Collect() as c:
        fn()
    return c.objs


def frames(key, setters):
    return {'frames': [('%s_%s' % (key, n), s) for n, s in setters]}


# =========================================================================================== sign

def sign_model(lit):
    post = flat(G.CHARCOAL, 0.45, 0.4)
    cyl('gs_foot', 0.2, 0.12, (0, 0, 0), mat=snowy('stone', lo=0.6, hi=0.8), segs=18, r_top=0.15)
    cyl('gs_post', 0.06, 2.75, (0, 0, 0.1), mat=post, segs=14, bevel=0.01)
    with L.Collect() as c:
        cyl('gs_back', 0.52, 0.06, (0, 0.03, 0), rot=(90, 0, 0), mat=flat(G.GOLD_D, 0.5), segs=48, origin='center',
            bevel=0.015)
        G.mark(1.0, depth=1.0, lit=0.55 if lit else 0.0, name='gs_mk')
        L.snow_slab('gs_snow', 0.52, 0.12, 0.06, (0, 0.02, 0.5), seed=5)
    L.group([o for o in c.objs if o.parent is None], 'gs_disc', loc=(0, 0, 2.7), rot=(-4, 0, T.CAM_PSI))
    cyl('gs_cap', 0.07, 0.05, (0, 0, 2.86), mat=G.flat(G.GOLD, 0.3, 0.5), segs=14, bevel=0.01)
    if lit:
        L.point_light('gs_glow', (0.45, -0.45, 2.6), 'window', 10.0, 0.4)


@gba('gb_sign', 'prop', fp=('r', 0.3), samples=56, notes='금방 pole sign (3.2 m): a 1 m 금방이 disc on a charcoal pole '
     'with a snowy foot, facing the camera (mark only, no letters - language-neutral). Frame _0 = day, _1 = lit '
     '(night: the disc face glows).', extra={'heightM': 3.2})
def b_gb_sign():
    # two separate models (day / lit) toggled by visibility
    day = collect(lambda: sign_model(False))
    lit = collect(lambda: sign_model(True))

    def show(which):
        def f():
            BA.show(day, which == 0)
            BA.show(lit, which == 1)
        return f
    show(0)()
    return frames('gb_sign', [('0', show(0)), ('1', show(1))])


# =========================================================================================== flag

FLAG = dict(pole=2.4, w=1.0, h=0.65)


def flag_cloth(i, n=FLAG_FRAMES):
    ph = i / float(n)
    W, H, top = FLAG['w'], FLAG['h'], FLAG['pole'] - 0.08
    # the cloth runs along the screen-right axis (+X+Y)/sqrt2 from the pole, its print faces the camera
    ax = Vector((math.sqrt(0.5), math.sqrt(0.5), 0.0))
    nrm = Vector((math.sqrt(0.5), -math.sqrt(0.5), 0.0))      # toward the camera

    def pos(u, v):
        a = 0.07 * u ** 1.1
        w = a * math.sin(math.tau * (u * 1.25 - ph))
        sag = -0.06 * u * u + 0.02 * u * math.sin(math.tau * (u * 0.7 - ph))
        p = ax * (0.05 + u * W * (1.0 - 0.03 * math.sin(math.tau * ph) * u)) + nrm * w + \
            Vector((0, 0, top - H + v * H + sag))
        return tuple(p)
    return G.cloth('gf_cloth', 24, 10, pos, G.tex_mat('gf_mat', TEX['flag'], alpha=False))


@gba('gb_flag', 'prop', fp=('r', 0.3), samples=48, notes='금방 flag (2.4 m pole, gold ball finial): a 1.0 x 0.65 m '
     'gold flag printed with the 금방이 mark and two cream sparkles (no letters), waving. anims.wave = 6 frames at '
     '8 fps, loop.', extra={'heightM': 2.4})
def b_gb_flag():
    cyl('gf_foot', 0.18, 0.1, (0, 0, 0), mat=snowy('stone', lo=0.6, hi=0.8), segs=18, r_top=0.13)
    cyl('gf_pole', 0.035, FLAG['pole'], (0, 0, 0.05), mat=flat('#E9E4DA', 0.35, 0.3), segs=12, bevel=0.005)
    sphere('gf_ball', 0.065, (0, 0, FLAG['pole'] + 0.1), G.flat(G.GOLD, 0.25, 0.6), segs=16, rings=10)
    sphere('gf_snow', 0.05, (0, 0, FLAG['pole'] + 0.16), flat('snow_mat', 0.9), scale=(1, 1, 0.5), segs=12, rings=6)
    cloths = [flag_cloth(i) for i in range(FLAG_FRAMES)]

    def show(k):
        def f():
            for j, c in enumerate(cloths):
                c.hide_render = j != k
                c.hide_viewport = j != k
        return f
    show(0)()
    return frames('gb_flag', [('wave_%d' % i, show(i)) for i in range(FLAG_FRAMES)])


# =========================================================================================== locker

def locker_model(lit=False):
    """Front -Y.  Returns (door hinge empties by slot, lit-part objects)."""
    P = LOCKER
    w, d, h = P['w'], P['d'], P['h']
    gold = G.m_gold(0.38)
    goldd = flat(G.GOLD_D, 0.45)
    cream = flat(G.CREAM, 0.55)
    navy = flat(G.NAVY, 0.4)
    char = flat(G.CHARCOAL, 0.5)
    box('lk_plinth', (w + 0.04, d + 0.04, P['plinth']), (0, 0, 0), mat=char, bevel=0.03)
    box('lk_body', (w, d, h - P['plinth'] - 0.1), (0, 0, P['plinth']), mat=gold, bevel=0.05)
    box('lk_cap', (w + 0.08, d + 0.1, 0.1), (0, 0, h - 0.1), mat=goldd, bevel=0.035)
    L.snow_slab('lk_snow', w + 0.02, d + 0.04, 0.08, (0, 0, h), seed=11)
    y = -d / 2
    # cream header with the mark screen
    hz0, hz1 = P['grid1'] + 0.06, h - 0.16
    box('lk_head', (w - 2 * P['frame'], 0.03, hz1 - hz0), (0, y - 0.004, hz0), mat=cream, bevel=0.012)
    scr = G._mat('gb_screen', '#FBF6EA', 0.3, 1.4 if lit else 0.15)
    box('lk_scr', (0.5, 0.03, hz1 - hz0 - 0.08), (0, y - 0.02, hz0 + 0.04), mat=scr, bevel=0.03)
    with L.Collect() as c:
        G.mark(0.27, depth=0.5, lit=0.9 if lit else 0.0, name='lk_mk')
    L.group([o for o in c.objs if o.parent is None], 'lk_mkg', loc=(0, y - 0.035, (hz0 + hz1) / 2))
    for sx in (-1, 1):
        for k in range(3):
            sphere('lk_dot', 0.022, (sx * (0.4 + k * 0.1), y - 0.024, (hz0 + hz1) / 2), G._mat(
                'gb_dot', G.GOLD, 0.4, 0.8 if lit else 0.0), scale=(1, 0.5, 1), segs=10, rings=6)
    # doors: 4 rows x 3 cols navy insets on the gold grid, each with a cream knob
    cw = (w - 2 * P['frame']) / P['cols']
    rh = (P['grid1'] - P['grid0']) / P['rows']
    hinges = []
    slots = []
    for r in range(P['rows']):
        for cidx in range(P['cols']):
            x0 = -w / 2 + P['frame'] + cidx * cw
            zt = P['grid1'] - r * rh
            zc = zt - rh / 2
            dw, dh = cw - 0.14, rh - 0.115           # gold grid between the doors: navy stays <= 15 %
            cx = x0 + cw / 2
            idx = r * P['cols'] + cidx
            # dark cubby behind every door (shows only when the door opens)
            box('lk_cub%d' % idx, (dw - 0.02, 0.2, dh - 0.02), (cx, y + 0.09, zc - (dh - 0.02) / 2),
                mat=flat('#2E3346', 0.85), bevel=0.0)
            with L.Collect() as dc:
                box('lk_door', (dw, 0.035, dh), (dw / 2, -0.012, -dh / 2), mat=navy, bevel=0.015)
                sphere('lk_knob', 0.026, (dw - 0.07, -0.035, 0.0), cream, scale=(1, 0.6, 1), segs=12, rings=8)
                # (polish L2) a cream label plate on every door: the 12-door grid reads gold + cream + navy
                # instead of a navy block (navy share 14.9 % -> ~12 %), still navy doors as the contract asks
                box('lk_tag', (0.2, 0.012, 0.075), (dw / 2, -0.03, dh * 0.5 - 0.1), mat=cream, bevel=0.006)
            hg = L.group([o for o in dc.objs if o.parent is None], 'lk_hinge%d' % idx, loc=(cx - dw / 2, y - 0.006, zc))
            hinges.append(hg)
            slots.append((cx, y - 0.04, zc))
    if lit:
        L.point_light('lk_glow', (0, y - 0.45, (hz0 + hz1) / 2), 'window', 8.0, 0.3)
    return hinges, slots


def locker_build(key):
    day = collect(lambda: locker_model(False))
    # remember the day model's hinges (names are unique per build; the lit model is a second copy)
    hinges_day = [o for o in day if o.name.startswith('lk_hinge')]
    lit = collect(lambda: locker_model(True))
    P = LOCKER
    slots = []
    cw = (P['w'] - 2 * P['frame']) / P['cols']
    rh = (P['grid1'] - P['grid0']) / P['rows']
    for r in range(P['rows']):
        for cidx in range(P['cols']):
            cx = -P['w'] / 2 + P['frame'] + cidx * cw + cw / 2
            zc = P['grid1'] - r * rh - rh / 2
            slots.append((cx, -P['d'] / 2 - 0.04, zc))
    for k, s in enumerate(slots):
        BA.mark('slot', s)
    BA.mark('open', slots[OPEN_SLOT])
    BA.mark('stand', (0.15, -P['d'] / 2 - 0.85, 0.0), facing=(0, 1, 0))
    BA.mark('fill', (-0.55, -P['d'] / 2 - 0.75, 0.0), facing=(0, 1, 0))
    hinges_day.sort(key=lambda o: int(o.name.split('lk_hinge')[1].split('.')[0]))
    door = hinges_day[OPEN_SLOT]

    def state(which, ang=0.0):
        def f():
            BA.show(day, which == 0)
            BA.show(lit, which == 1)
            door.rotation_euler = (0, 0, math.radians(-ang))
        return f
    seq = [('0', state(0)), ('1', state(1))] + [('open_%d' % i, state(0, a)) for i, a in enumerate(OPEN_ANG)]
    state(0)()
    return frames(key, seq)


LOCKER_NOTE = ('금방 보관함 parcel locker (1.8 x 0.6 x 2 m): a gold cabinet on a charcoal plinth, 12 navy doors (4 rows '
               'x 3) on a gold grid with cream knobs, a cream header with the glowing 금방이 screen and gold dots, a '
               'snow cap.  _0 day, _1 lit (screen + dots glow).  open = 4 frames at 12 fps, once: door openSlot swings '
               'open (patches over _0; play backward to close).  slotPoints[12] = door centres (index = row * 3 + '
               'col, row 0 = top), standPoint/standDir = where a resident opens a door, fillPoint/fillDir = where the '
               'courier fills it.')


@gba('gb_locker_a', 'prop', fp=(1.8, 0.6), yaw=0.0, samples=56, front='-Y', notes=LOCKER_NOTE + ' Faces SW.',
     extra={'faces': 'SW', 'heightM': 2.0, 'openSlot': OPEN_SLOT})
def b_gb_locker_a():
    return locker_build('gb_locker_a')


@gba('gb_locker_b', 'prop', fp=(1.8, 0.6), yaw=90.0, samples=56, front='+X', notes=LOCKER_NOTE + ' Faces SE.',
     extra={'faces': 'SE', 'heightM': 2.0, 'openSlot': OPEN_SLOT})
def b_gb_locker_b():
    return locker_build('gb_locker_b')


# =========================================================================================== items

def ground(objs, spin=-16.0):
    return BA._ground_item(objs, 0.0, spin)


def parcel_item(size):
    sx, sy, sz = SIZES[size]
    ground(collect(lambda: G.gb_parcel('gp', sx, sy, sz)))


for _s, _th in (('s', 0.26), ('m', 0.34), ('l', 0.44)):
    gba('gb_parcel_' + _s, 'item', item={'thickness': _th}, samples=64,
        notes='금방 parcel (%s): a kraft box with a gold tape cross and the 금방이 sticker.' % _s,
        extra={'boxOf': 'cardboard_box_' + _s, 'category': 'goods'})((lambda s: (lambda: parcel_item(s)))(_s))


@gba('gb_parcel_doorstep', 'item', item={'thickness': 0.34}, samples=64,
     notes='A 금방 parcel waiting on a doormat. _0 = just delivered, _1 = after 4 game hours outside (a snow cap on '
           'the box and the mat edge).', extra={'category': 'goods'})
def b_gb_parcel_doorstep():
    def mat_and_box(snow):
        sx, sy, sz = SIZES['m']
        mm = L.stripes('#7E9C8A', '#6F8C7B', 10.0, 'X', rough=0.95, soft=0.2)
        box('dm_mat', (0.66, 0.44, 0.03), (0, 0, 0), mat=mm, bevel=0.012)
        box('dm_rim', (0.7, 0.48, 0.02), (0, 0, 0), mat=flat('#5E7568', 0.9), bevel=0.008)
        G.gb_parcel('gpd', sx, sy, sz, loc=(0.03, 0.02, 0.03), rot_z=8, snow=snow, seed=4)
        if snow:
            blob('dm_snow', 0.09, (-0.26, -0.08, 0.03), flat('snow_mat', 0.9), scale=(1.2, 1.6, 0.45), seed=9, amp=0.2,
                 subdiv=2, flat_bottom=0.5)
    a = collect(lambda: mat_and_box(False))
    ga = ground(a, spin=-14)
    b = collect(lambda: mat_and_box(True))
    gb_ = ground(b, spin=-14)

    def show(k):
        def f():
            BA.show(BA.descendants([ga]) + [ga], k == 0)
            BA.show(BA.descendants([gb_]) + [gb_], k == 1)
        return f
    show(0)()
    return frames('gb_parcel_doorstep', [('0', show(0)), ('1', show(1))])


@gba('gb_parcel_open', 'item', item={'thickness': 0.34}, samples=64,
     notes='An opened 금방 parcel: flaps folded out, empty inside (the unboxing aftermath).', extra={'category': 'goods'})
def b_gb_parcel_open():
    sx, sy, sz = SIZES['m']
    ground(collect(lambda: G.gb_parcel('gpo', sx, sy, sz, open_=True)), spin=-16)


@gba('gb_parcel_cat', 'item', item={'thickness': 0.34}, samples=64,
     notes='나비 (pet_cat) peeking out of an opened 금방 parcel ("고양이는 상자가 더 좋대요"). _0 eyes open, _1 blink.',
     extra={'category': 'goods'})
def b_gb_parcel_cat():
    import vil_pets as VP
    import vil_anim as VA
    sx, sy, sz = 0.54, 0.44, 0.4
    box_objs = collect(lambda: G.gb_parcel('gpc', sx, sy, sz * 0.9, open_=True))
    before = set(bpy.data.objects)
    rig = VP.build_cat()
    cat_objs = [o for o in bpy.data.objects if o not in before]
    root = rig.j['root']
    root.location = (0.0, -0.04, 0.03)

    def pose(face):
        p = {'body': (58, 0, 0), 'neck': (-22, 0, 0), 'head': (-30, 0, 0),
             'leg_FR': (-35, 0, 0), 'leg_FL': (-35, 0, 0), 'knee_FR': (-20, 0, 0), 'knee_FL': (-20, 0, 0),
             'ear_R': (0, 0, 0), 'ear_L': (0, 0, 0), 'tail': (0, 0, 0)}
        p['_show'] = set(VA.PET_FACES[face])
        rig.apply(p)
    pose('pet_neutral')
    g = ground(box_objs + [root] + [o for o in cat_objs if o.parent is None and o is not root], spin=-16)
    del g

    def show(face):
        def f():
            pose(face)
        return f
    return frames('gb_parcel_cat', [('0', show('pet_neutral')), ('1', show('pet_blink'))])


def render_all(opts):
    import bld_render as BR
    import gb_tex
    TEX['dir'] = os.path.join(opts['cache'], 'tex')
    TEX.update(gb_tex.write_all(TEX['dir']))
    out = os.path.join(opts['cache'], 'builds')
    os.makedirs(out, exist_ok=True)
    keys = list(GBA)
    if opts.get('only'):
        keys = [k for k in keys if k in opts['only']]
    for k in keys:
        if not opts['force'] and BR.cached(k, out):
            print('[%s] cached' % k)
            continue
        BR.render_build(GBA[k], out, opts.get('samples'))
