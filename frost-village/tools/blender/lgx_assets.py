"""
lgx_assets.py - items and the two new producers of the v8 logistics set (docs/CONTRACT_V8.md section AA).

Registry LGX maps a build key to a spec in the format of bld_assets.BLD, rendered by bld_render.render_build()
UNCHANGED (same camera / light / PPU, items 72 x 72 anchored (36, 54), stations with idle + anims.work).

Items (kind "item", atlas lgx_items):
  furniture   item_chair, item_table, item_sofa, item_bed, item_wardrobe
  appliances  item_fridge, item_stove_iron, item_washer, item_radio, item_tv_retro
  tools       item_toolbox (the SAME builder as assets/buildings item_toolbox, re-rendered so this fragment is
              self-contained - identical look)
  crates      item_crate_food, item_crate_cans, item_crate_bread, item_crate_produce, item_crate_smoked (food)
  goods       item_crate_jam, item_cloth_rolls (polish: printed / coloured goods so the goods rack is not only
              brown boxes)
  tools       item_crate_tools (polish: a crate of new axes / picks / sickles - the tools rack reads as tools)
  pallets     pallet_planks, pallet_ingots, pallet_logs, pallet_boxes, pallet_ore (polish: 광석 for materials)
  boxes       cardboard_box_s, cardboard_box_m, cardboard_box_l
Producers (kind "station", atlas lgx_producers, 3 x 3 m, front -Y):
  furniture_workshop (planks -> furniture), appliance_factory (ingots -> appliances)

Not run directly - see lgx_render.py.
"""
import math
from collections import OrderedDict

import bpy  # noqa: F401
from mathutils import Vector

import prop_lib as L
from prop_lib import C, flat, snowy, tonal, box, cyl, sphere, blob, extrude, hexmix
import prop_assets as PA
import bld_assets as BA
import town_lib as T
import life2_lib as L2
import lgx_lib as X
from bld_assets import mark

LGX = OrderedDict()


def lgx(key, kind, atlas, fp=None, yaw=0.0, shadow=True, samples=48, notes='', front=None, catcher=18.0, work=0,
        fps=8, item=None, sprites=None, extra=None):
    def deco(fn):
        LGX[key] = dict(key=key, fn=fn, kind=kind, atlas=atlas, fp=fp, yaw=yaw, shadow=shadow and not item,
                        samples=samples, notes=notes, front=front, catcher=catcher, work=work, fps=fps, item=item,
                        sprites=sprites, extra=extra or {})
        return fn
    return deco


def item(key, thickness, notes, category, samples=64):
    return lgx(key, 'item', 'lgx_items', item={'thickness': thickness}, samples=samples, notes=notes,
               extra={'category': category})


def ground(objs, spin=0.0, tilt=0.0):
    return BA._ground_item(objs, tilt, spin)


def collect(fn):
    with L.Collect() as c:
        fn()
    return c.objs


# =========================================================================================== furniture

@item('item_chair', 0.36, 'Wooden chair with a red cushion (toy scale), seen three-quarter.', 'furniture')
def b_item_chair():
    ground(collect(lambda: X.chair_model('ch', 0.82, '#C98F55', '#D9483B')), spin=-32)


@item('item_table', 0.44, 'Small wooden dining table with a checked runner and a tiny flower vase.', 'furniture')
def b_item_table():
    def f():
        X.table_model('tb', 0.8, 0.54, 0.46, '#C98F55')
        nb = L.NB('runner', rough=0.85)
        tc = nb.n('ShaderNodeTexCoord')
        chk = nb.n('ShaderNodeTexChecker')
        chk.inputs['Scale'].default_value = 9.0
        chk.inputs['Color1'].default_value = nb.rgb('#D9483B')
        chk.inputs['Color2'].default_value = nb.rgb('#FBF6EA')
        nb.link(tc.outputs['Object'], chk.inputs['Vector'])
        nb.base(chk.outputs['Color'])
        box('runner', (0.3, 0.56, 0.012), (0, 0, 0.46), mat=nb.m, bevel=0.0)
        cyl('vase', 0.045, 0.11, (0.02, 0.0, 0.47), mat=flat('#3D7CC9', 0.25), segs=14, r_top=0.03, bevel=0.01)
        for k, c in enumerate(('#F2C14E', '#E8524A', '#F28DB2')):
            sphere('fl%d' % k, 0.03, (0.02 + (k - 1) * 0.035, 0.0, 0.6 + 0.02 * (k % 2)), flat(c, 0.5), segs=10,
                   rings=6)
    ground(collect(f), spin=-12)


@item('item_sofa', 0.4, 'Chubby mint two-seat sofa with rolled arms, two cushions and a yellow throw pillow.',
      'furniture')
def b_item_sofa():
    ground(collect(lambda: X.sofa_model('sf', 0.96, 0.46, '#3FA58C')), spin=-14)


@item('item_bed', 0.3, 'Cosy wooden bed (side view: headboard with a little heart at the left, blue patchwork '
                       'quilt, white pillow).', 'furniture')
def b_item_bed():
    ground(collect(lambda: X.bed_model('bd', 0.98, 0.56)), spin=0)


@item('item_wardrobe', 0.8, 'Stubby wooden wardrobe with two panel doors and gold knobs.', 'furniture')
def b_item_wardrobe():
    ground(collect(lambda: X.wardrobe_model('wd', 0.56, 0.34, 0.7, '#B9783F')), spin=-24)


# =========================================================================================== appliances

@item('item_fridge', 0.78, 'Retro rounded mint fridge with chrome lever handles and a little red badge.',
      'appliances')
def b_item_fridge():
    ground(collect(lambda: X.fridge_model('fr', 0.46, 0.4, 0.76, '#9FD8C8')), spin=-26)


@item('item_stove_iron', 0.6, 'Cast-iron pot-belly stove (난로) with a glowing window and a red kettle on top.',
      'appliances')
def b_item_stove_iron():
    ground(collect(lambda: X.stove_model('st', 0.82)), spin=0)


@item('item_washer', 0.56, 'Front-loading washing machine: blue water swirling behind a round porthole, dial and '
                           'detergent drawer.', 'appliances')
def b_item_washer():
    ground(collect(lambda: X.washer_model('wa', 0.48, 0.44, 0.56, '#F4F1EA')), spin=-22)


@item('item_radio', 0.32, 'Retro wooden table radio: arched top, cream speaker grille, glowing gold dial, two knobs.',
      'appliances')
def b_item_radio():
    ground(collect(lambda: X.radio_model('ra', 0.52, 0.24, 0.34, '#B9783F')), spin=-10)


@item('item_tv_retro', 0.52, 'Retro CRT television in a wooden cabinet on splayed legs, rabbit-ear antenna, softly '
                             'glowing screen.', 'appliances')
def b_item_tv_retro():
    ground(collect(lambda: X.tv_model('tv', 0.5, 0.42, 0.4, '#C98F55')), spin=-20)


lgx('item_toolbox', 'item', 'lgx_items', item={'thickness': 0.25}, samples=64,
    notes='Toolbox (tools): red metal box with a steel carry handle, latches and a hammer + saw handle poking out. '
          'Same builder as assets/buildings item_toolbox (identical look), re-rendered here so the logistics '
          'fragment is self-contained.', extra={'category': 'tools'})(BA.b_item_toolbox)


# =========================================================================================== crates

def crate_food_contents():
    PA.fish_model('cff', loc=(-0.1, 0.02, 0.36), rot=(0, 0, 18), scale=0.42)
    PA.bread_model('cfb', loc=(0.12, 0.05, 0.36), rot=(0, 0, -30), scale=0.42)
    mb = L2.MB()
    for k, (x, y) in enumerate(((0.16, -0.1), (0.04, -0.12), (-0.2, -0.08))):
        X.apple(mb, (x, y, 0.37), 0.055, ['#D9483B', '#E8A23C', '#D9483B'][k])
    mb.done('cfa')


@item('item_crate_food', 0.34, 'Open wooden crate of mixed food: a fish, a loaf, apples.', 'food')
def b_item_crate_food():
    def f():
        X.crate_open('cr', 0.6, 0.44, 0.34)
        crate_food_contents()
    ground(collect(f), spin=0)


@item('item_crate_cans', 0.34, 'Open wooden crate packed with red and blue tin cans (lids up).', 'food')
def b_item_crate_cans():
    def f():
        X.crate_open('cr', 0.6, 0.44, 0.34, col='#B9874F', dark='#8E6338')
        k = 0
        for j, y in enumerate((-0.1, 0.1)):
            for x in (-0.18, 0.0, 0.18):
                BA.can_model('cc%d' % k, r=0.075, h=0.13, loc=(x, y, 0.22), label=['#D9483B', '#3D7CC9'][(k + j) % 2],
                             fish=False, lid=True)
                k += 1
    ground(collect(f), spin=0)


@item('item_crate_bread', 0.34, 'Crate of fresh bread: two long loaves and round buns.', 'food')
def b_item_crate_bread():
    def f():
        X.crate_open('cr', 0.6, 0.44, 0.34, col='#D4A26A', dark='#A87442')
        PA.bread_model('br1', loc=(-0.08, 0.06, 0.36), rot=(0, 0, 10), scale=0.55)
        PA.bread_model('br2', loc=(0.1, -0.02, 0.38), rot=(0, 0, -15), scale=0.5)
        mb = L2.MB()
        X.bun(mb, (-0.17, -0.12, 0.36), 0.6, 0.3)
        X.bun(mb, (0.2, 0.12, 0.36), 0.55, -0.4)
        mb.done('buns')
    ground(collect(f), spin=0)


@item('item_crate_produce', 0.34, 'Crate of vegetables: green cabbages, carrots and red apples.', 'food')
def b_item_crate_produce():
    def f():
        X.crate_open('cr', 0.6, 0.44, 0.34, col='#C98F55')
        mb = L2.MB()
        X.cabbage(mb, (-0.15, 0.05, 0.36), 0.11)
        X.cabbage(mb, (0.05, 0.08, 0.37), 0.1)
        X.carrot(mb, (0.08, -0.1, 0.38), 0.4)
        X.carrot(mb, (-0.02, -0.12, 0.38), 0.9)
        X.apple(mb, (0.2, 0.0, 0.37), 0.055)
        X.apple(mb, (0.2, -0.13, 0.36), 0.05, '#E8A23C')
        mb.done('veg')
    ground(collect(f), spin=0)


# =========================================================================================== pallets

@item('pallet_planks', 0.42, 'Pallet of sawn planks strapped with blue bands (materials).', 'materials')
def b_pallet_planks():
    def f():
        X.pallet('pl', 0.74, 0.74, 0.12)
        X.plank_stack('pk', 0.7, 0.72, 4, loc=(0, 0, 0.12))
    ground(collect(f), spin=0)


@item('pallet_ingots', 0.42, 'Pallet of shiny metal ingots stacked crosswise (materials).', 'materials')
def b_pallet_ingots():
    def f():
        X.pallet('pl', 0.74, 0.74, 0.12)
        X.ingot_stack('ig', 3, 2, 3, loc=(0, 0, 0.12), scale=0.5)
    ground(collect(f), spin=0)


@item('pallet_logs', 0.46, 'Pallet of round logs (end grain toward the viewer) held by a red strap (materials).',
      'materials')
def b_pallet_logs():
    def f():
        X.pallet('pl', 0.74, 0.74, 0.12)
        PA.log_pile('lg', n_bottom=3, r=0.11, length=0.72, loc=(0, 0, 0.12), rot=(0, 0, 90), snow=False, seed=3)
        sm = flat('#D9483B', 0.5)
        for x in (-0.22, 0.22):
            L.box('strap', (0.04, 0.52, 0.012), (x, 0, 0.53), mat=sm, bevel=0.0)
    ground(collect(f), spin=0)


@item('pallet_boxes', 0.42, 'Pallet of brown parcels stacked two high with a blue strap (goods).', 'goods')
def b_pallet_boxes():
    def f():
        X.pallet('pl', 0.74, 0.74, 0.12)
        k = 0
        for x in (-0.18, 0.18):
            for y in (-0.18, 0.18):
                X.cardboard_box('pb%d' % k, 0.34, 0.34, 0.2, loc=(x, y, 0.12), label=(k == 0), seed=k)
                k += 1
        X.cardboard_box('pbt0', 0.34, 0.34, 0.2, loc=(-0.17, 0.0, 0.32), label=True)
        X.cardboard_box('pbt1', 0.3, 0.3, 0.18, loc=(0.18, 0.05, 0.32), rot_z=8, label=False)
        sm = flat('#3D7CC9', 0.5)
        box('strap', (0.76, 0.04, 0.012), (0, -0.16, 0.52), mat=sm, bevel=0.0)
    ground(collect(f), spin=0)


# =========================================================================================== cardboard boxes

@item('cardboard_box_s', 0.26, 'Small kraft parcel with tape and a this-way-up label.', 'goods')
def b_cardboard_box_s():
    ground(collect(lambda: X.cardboard_box('cb', 0.36, 0.3, 0.26)), spin=-16)


@item('cardboard_box_m', 0.34, 'Medium kraft parcel with tape and a this-way-up label.', 'goods')
def b_cardboard_box_m():
    ground(collect(lambda: X.cardboard_box('cb', 0.48, 0.4, 0.34)), spin=-16)


@item('cardboard_box_l', 0.44, 'Large kraft box with tape and a this-way-up label.', 'goods')
def b_cardboard_box_l():
    ground(collect(lambda: X.cardboard_box('cb', 0.62, 0.5, 0.44)), spin=-16)


# =========================================================================================== (polish) more goods

@item('item_crate_jam', 0.34, 'Crate of jam jars - strawberry, blueberry and apricot jam with cloth-capped lids and '
                              'white labels (goods).', 'goods')
def b_item_crate_jam():
    def f():
        X.crate_open('cr', 0.6, 0.44, 0.3, col='#D4A26A', dark='#A87442')
        fills = [('#D9483B', '#F4F1EA'), ('#5A4FA3', '#F2C14E'), ('#E8A23C', '#3D7CC9')]
        k = 0
        for j, y in enumerate((0.09, -0.09)):
            for i, x in enumerate((-0.17, 0.0, 0.17)):
                fl, lid = fills[(i + j) % 3]
                BA.jar_model('jar%d' % k, r=0.07, h=0.23, loc=(x, y, 0.22 + 0.015 * j), fill=fl, lid=lid)
                k += 1
    ground(collect(f), spin=0)


def _gingham(name, c1, c2, scale=14.0):
    nb = L.NB(name, rough=0.85)
    tc = nb.n('ShaderNodeTexCoord')
    chk = nb.n('ShaderNodeTexChecker')
    chk.inputs['Scale'].default_value = scale
    chk.inputs['Color1'].default_value = nb.rgb(c1)
    chk.inputs['Color2'].default_value = nb.rgb(c2)
    nb.link(tc.outputs['Object'], chk.inputs['Vector'])
    nb.base(chk.outputs['Color'])
    return nb.m


@item('item_cloth_rolls', 0.34, 'Bolts of fabric on a low tray - red gingham, blue stripes and sunny yellow, tied with '
                                'twine (goods).', 'goods')
def b_item_cloth_rolls():
    def f():
        X.pallet('tray', 0.66, 0.5, 0.06, col='#C98F55')
        mats = [_gingham('ging', '#D9483B', '#FBF6EA'), L.stripes('#3D7CC9', '#F4F1EA', 9.0, 'Y', soft=0.05),
                flat('#F2C14E', 0.7)]
        twine = flat('#C9A46A', 0.85)
        for k, (y, z, m) in enumerate(((-0.11, 0.165, mats[0]), (0.11, 0.165, mats[1]), (0.0, 0.345, mats[2]))):
            cyl('roll%d' % k, 0.105, 0.58, (0.0, y, z), rot=(0, 90, 0), mat=m, segs=24, origin='center', bevel=0.02)
            cyl('core%d' % k, 0.03, 0.6, (0.0, y, z), rot=(0, 90, 0), mat=flat('#8A5A33', 0.7), segs=10,
                origin='center', bevel=0.0)
            for x in (-0.16, 0.16):
                cyl('tw%d' % k, 0.109, 0.025, (x, y, z), rot=(0, 90, 0), mat=twine, segs=24, origin='center',
                    bevel=0.0)
    ground(collect(f), spin=-14)


@item('item_crate_smoked', 0.34, 'Crate of smoked goods (훈제): two glossy smoked hams and a pair of golden smoked fish '
                                 '(food).', 'food')
def b_item_crate_smoked():
    def f():
        X.crate_open('cr', 0.6, 0.44, 0.3, col='#B9874F', dark='#8E6338')
        PA.meat_model('ham1', cooked=True, loc=(0.02, 0.09, 0.23), rot=(0, 0, 4), scale=0.6)
        PA.fish_model('sf1', cooked=True, loc=(-0.02, -0.07, 0.33), rot=(0, 0, 6), scale=0.4)
        PA.fish_model('sf2', cooked=True, loc=(0.04, -0.01, 0.39), rot=(0, 0, -10), scale=0.36)
        tw = flat('#C9A46A', 0.85)
        for x in (-0.06, 0.08):
            box('twine', (0.012, 0.16, 0.012), (x, -0.04, 0.43), mat=tw, bevel=0.0)
        box('tag', (0.12, 0.012, 0.08), (0.2, -0.225, 0.2), rot=(0, 0, 0), mat=flat('#F4F1EA', 0.6), bevel=0.004)
    ground(collect(f), spin=0)


@item('item_crate_tools', 0.36, 'Crate of brand-new tools: an axe and a pickaxe with their heads up and a sickle '
                                '(tools).', 'tools')
def b_item_crate_tools():
    def f():
        X.crate_open('cr', 0.58, 0.42, 0.28, col='#C98F55')
        # tools stand in the crate, heads up, so they read as tools at phone zoom
        BA.axe_model('ax', s=0.9, loc=(-0.13, 0.06, 0.2), rot=(0, -74, 20))
        BA.pick_model('pk', s=0.72, loc=(0.12, 0.08, 0.2), rot=(0, -78, -15))
        BA.sickle_model('sk', s=0.62, loc=(0.0, -0.1, 0.3), rot=(0, 0, -20), flat_blade=True)
    ground(collect(f), spin=0)


@item('pallet_ore', 0.42, 'Pallet of raw ore: grey rocks studded with orange ore nuggets (materials).',
      'materials')
def b_pallet_ore():
    def f():
        X.pallet('pl', 0.74, 0.74, 0.12)
        for k, (x, y, r) in enumerate(((-0.16, 0.14, 0.17), (0.16, 0.12, 0.16), (-0.12, -0.15, 0.16),
                                       (0.17, -0.14, 0.15), (0.0, 0.0, 0.17))):
            z = 0.12 + 0.45 * r * 0.8 + (0.1 if k == 4 else 0.0)
            PA.ore_rock('or%d' % k, r, (x, y, z), (1.0, 1.0, 0.8), 11 + k, 2, ore_size=0.06)
    ground(collect(f), spin=0)


# =========================================================================================== producers

WORKSHOP_NOTE = ('Furniture workshop (가구 공방, 3 x 3 m): warm plank workshop with a red snowy gable roof, a stove-pipe '
                 'chimney, an open barn door with tools on the back wall and a giant 3D chair on the ridge. In front '
                 '(screen down-left) a table saw on a work bench running along Y: a pallet of planks at its back end '
                 '(input side), a freshly made chair and a mint sofa at the right (output). anims.work = the saw '
                 'blade spins (3 red marks, seamless), sawdust spray, lamp glow (chimney smoke = the game\'s soft '
                 'fx_smoke puffs at fxPoints.smoke, not baked). workSpot = the operator at the screen-LEFT end of the '
                 'bench, seen in profile facing E (the saw stays visible), inPoint = planks pad (front-left), '
                 'outPoint = furniture pad (right).')


def saw_blade(name, r=0.22):
    """Circular saw blade standing in the XZ plane (axis Y); 3 red marks -> 120 deg symmetry."""
    steel = flat('#DCE4EE', 0.2, 0.85)
    objs = [cyl(name + '_d', r, 0.02, (0, 0, 0), rot=(90, 0, 0), mat=steel, segs=40, origin='center', bevel=0.003)]
    mb = L2.MB()
    for k in range(18):
        a = math.tau * k / 18
        mb.cone(0.03, 0.0, 0.05, steel, loc=(math.cos(a) * (r + 0.015), 0, math.sin(a) * (r + 0.015)),
                rot=(0, 90 - math.degrees(a), 0), segs=4)
    objs.append(mb.done(name + '_teeth'))
    rm = flat('#D9483B', 0.4)
    for k in range(3):
        a = math.tau * k / 3
        objs.append(box(name + '_m', (0.05, 0.026, r * 0.62), (math.cos(a) * r * 0.5, 0, math.sin(a) * r * 0.5),
                        rot=(0, 90 - math.degrees(a), 0), mat=rm, bevel=0.005, origin='center'))
    objs.append(cyl(name + '_hub', 0.05, 0.035, (0, 0, 0), rot=(90, 0, 0), mat=flat('#3B3F48', 0.4, 0.5), segs=16,
                    origin='center', bevel=0.008))
    return L.group(objs, name)


@lgx('furniture_workshop', 'station', 'lgx_producers', fp=(3.0, 3.0), front='-Y', catcher=22.0, work=4, fps=8,
     samples=48, notes=WORKSHOP_NOTE, extra={'name': {'ko': '가구 공방', 'en': 'Furniture workshop'},
                                              'chain': {'in': 'item_plank', 'out': ['item_chair', 'item_table',
                                                                                    'item_sofa', 'item_bed',
                                                                                    'item_wardrobe']}})
def b_furniture_workshop():
    W, Y0, Y1 = 2.6, -0.05, 1.35
    D = Y1 - Y0
    yc = (Y0 + Y1) / 2
    box('plinth', (W + 0.12, D + 0.12, 0.12), (0, yc, 0), mat=snowy('#8E96A3', lo=0.75, hi=0.9), bevel=0.03)
    wall = BA.plank_wall('walls', (W, D, 1.95), (0, yc, 0.1), cols=('#D9A766', '#C98F55'))
    del wall
    top = 2.05
    for x in (-W / 2, W / 2):
        for y in (Y0, Y1):
            box('post', (0.14, 0.14, top - 0.05), (x, y, 0.1), mat=flat('#8A5A33', 0.75), bevel=0.02)
    roofm = L.stripes('#C0473A', '#A63C31', 4.0, 'Y', rough=0.8, soft=0.04)
    rz = top + 0.95
    g = BA.gable_roof('roof', W + 0.5, D, top, rz, 0.3, roofm, snow_frac=(0.62, 0.62), seed=61, ridge_col='#7A2E25')
    for o in BA.top_level(g):
        o.location.y += yc
    for s in (-1, 1):
        BA.gable_end('gable', D + 0.02, top - 0.01, rz, s * (W / 2 - 0.03), flat('#C98F55', 0.85)).location.y += yc
    # open barn door: dark opening + hanging tools on the back wall + the two door leaves swung open
    box('opening', (1.0, 0.04, 1.3), (-0.55, Y0 - 0.01, 0.12), mat=flat('#4A3426', 0.9), bevel=0.0)
    tm = flat('#C3CCD8', 0.3, 0.7)
    for k, x in enumerate((-0.85, -0.6, -0.35)):
        box('htool', (0.05, 0.02, 0.4), (x, Y0 - 0.04, 0.75), mat=tm if k != 1 else flat('#C98F55', 0.6), bevel=0.01)
    box('hsaw', (0.32, 0.015, 0.12), (-0.55, Y0 - 0.045, 1.2), mat=tm, bevel=0.005)
    for s, x in ((-1, -1.05), (1, -0.05)):
        lf = box('leaf', (0.5, 0.06, 1.3), (x + s * 0.25, Y0 - 0.1, 0.12), rot=(0, 0, s * -55),
                 mat=L.stripes('#3E7F55', '#346B47', 6.0, 'X', soft=0.05), bevel=0.02)
        del lf
    BA.window('fwin', (0.75, Y0 - 0.02, 1.55), 'y-', w=0.55, h=0.45, shutters='#3E7F55', frame='#5E3A22', seed=2)
    BA.window('swin', (W / 2 + 0.02, yc, 1.55), 'x+', w=0.55, h=0.45, shutters='#3E7F55', frame='#5E3A22', seed=3)
    # giant chair emblem on the ridge
    with L.Collect() as cc:
        X.chair_model('bigchair', 1.0, '#C98F55', '#D9483B')
    L.group(BA.top_level(cc.objs), 'bigchair_g', loc=(0.0, yc, rz + 0.05), rot=(0, 0, 45))
    box('chairbase', (0.6, 0.5, 0.08), (0, yc, rz - 0.02), mat=flat('#5E3A22', 0.8), bevel=0.02)
    # stove-pipe chimney (back right)
    chx, chy = 0.85, 1.05
    cyl('chim', 0.09, 1.5, (chx, chy, 2.0), mat=flat('#3B3F48', 0.4, 0.4), segs=16, bevel=0.0)
    cyl('chimcap', 0.16, 0.06, (chx, chy, 3.5), mat=flat('#3B3F48', 0.4, 0.4), segs=16, r_top=0.08)
    # ---- work bench along Y in front with a table saw
    bx, by0, by1, bz = 0.0, -1.25, -0.35, 0.72
    wm = tonal('#D9A766', 0.07, 5.0, rough=0.6)
    box('bench', (0.62, by1 - by0, 0.08), (bx, (by0 + by1) / 2, bz - 0.08), mat=wm, bevel=0.02)
    for y in (by0 + 0.08, by1 - 0.08):
        for x in (bx - 0.24, bx + 0.24):
            box('bleg', (0.07, 0.07, bz - 0.08), (x, y, 0), mat=flat('#8A5A33', 0.7), bevel=0.01)
    box('bshelf', (0.5, by1 - by0 - 0.1, 0.04), (bx, (by0 + by1) / 2, 0.25), mat=wm, bevel=0.01)
    box('sawbox', (0.36, 0.42, 0.06), (bx, -0.85, bz), mat=flat('#3E7F55', 0.4), bevel=0.02)
    blade = saw_blade('blade', 0.25)
    blade.location = (bx, -0.85, bz + 0.07)
    blade.rotation_euler = (0, 0, math.radians(90))
    box('guard', (0.06, 0.3, 0.08), (bx, -0.85, bz + 0.38), mat=flat('#F2C230', 0.4), bevel=0.02)
    box('plank_in', (0.14, 0.62, 0.04), (bx - 0.05, -1.0, bz + 0.06), rot=(0, 0, 0), mat=tonal('#E3B47A', 0.08, 5.0),
        bevel=0.008)
    # (no work-in-progress chair on the bench any more: it hid the saw - the saw + sawdust read better alone)
    # input: pallet of planks behind the bench (left) - output: chair + sofa at the right
    with L.Collect() as ci:
        X.pallet('inpal', 0.74, 0.74, 0.12)
        X.plank_stack('inpk', 0.7, 0.72, 4, loc=(0, 0, 0.12))
    L.group(BA.top_level(ci.objs), 'in_g', loc=(-1.0, -0.75, 0), rot=(0, 0, 0))
    with L.Collect() as co:
        X.sofa_model('outsofa', 0.9, 0.44, '#3FA58C')
    L.group(BA.top_level(co.objs), 'out_g', loc=(1.0, -0.65, 0), rot=(0, 0, 0))
    with L.Collect() as co2:
        X.chair_model('outchair', 0.75, '#C98F55', '#D9483B')
    L.group(BA.top_level(co2.objs), 'out2_g', loc=(1.15, -1.3, 0), rot=(0, 0, -20))
    # lamp over the door
    lamp_m = L.emissive('wlamp', '#FFE2A0', '#FFD27A', 1.5)
    sphere('wlamp', 0.08, (-0.55, Y0 - 0.25, 1.62), lamp_m, segs=14, rings=8)
    box('wlamp_arm', (0.04, 0.25, 0.04), (-0.55, Y0 - 0.12, 1.68), mat=flat(X.INK, 0.5), bevel=0.0)
    glow = L.point_light('wglow', (-0.4, -0.6, 1.4), 'window', 6.0, 0.2)
    dust = L.Spray('dust', (bx + 0.0, -0.98, bz + 0.14), (0.1, -0.75, 0.8), flat('#F7E3B5', 0.8), n=16, grav=1.6,
                   r=0.04, spread=0.3, seed=7)
    dcloud = L.Smoke('dcloud', (bx + 0.02, -1.05, bz + 0.1), n=3, rise=0.35, drift=(0.05, -0.35), r0=0.07, r1=0.2,
                     color='#F3E2C0', alpha=0.8, seed=9)
    # (polish) no baked chimney smoke: the faceted low-poly puffs read as grey rocks at 8 fps - the game spawns its
    # soft fx_smoke at fxPoints.smoke (like the houses / town buildings)

    def idle():
        blade.rotation_euler = (0, math.radians(10), math.radians(90))
        dust.show(False)
        dcloud.show(False)
        L.set_emission(lamp_m, 1.0)
        glow.data.energy = 3.0

    def work(i):
        blade.rotation_euler = (0, math.radians(10 + 30 * i), math.radians(90))
        dust.set(i)
        dcloud.set(i)
        L.set_emission(lamp_m, [2.0, 2.6, 2.2, 2.8][i])
        glow.data.energy = [6.0, 8.0, 7.0, 9.0][i]

    idle()
    mark('in', (-0.9, -2.6, 0.0))
    mark('out', (2.6, -0.9, 0.0))
    # (polish) the operator stands at the screen-LEFT end of the bench (world -X/-Y of the saw) and faces E (= world
    # +X+Y, screen right): seen in profile, he no longer hides the saw + sawdust (he used to stand in front of it,
    # back to the camera)
    ws = (bx - 0.6, -1.45, 0.0)
    mark('work', ws, facing=(1, 1, 0))
    mark('staff', ws, facing=(1, 1, 0))
    return {'idle': idle, 'work': work,
            'fx': {'saw': (bx, -0.85, bz + 0.2), 'dust': (bx, -1.0, bz + 0.25), 'smoke': (chx, chy, 3.75),
                   'input': (-1.0, -0.75, 0.7), 'output': (1.0, -0.65, 0.6), 'emblem': (0.0, yc, rz + 0.6)},
            'extra': {'workSpot': {'forwardM': 0.6, 'heightM': bz, 'dir': 'E',
                                   'note': 'stand at the screen-left end of the bench facing E (profile, the saw stays '
                                           'visible); he is in front of the station in depth: draw him above the '
                                           'station sprite'}}}


FACTORY_NOTE = ('Appliance factory (가전 공장, 3 x 3 m): little brick factory with a saw-tooth roof of glowing '
                'skylights, a tall striped chimney, a mint roll-up door and a TV emblem on the front. In front '
                '(screen down-left) a stamping press on a steel table: a crate of ingots at its back (input side), '
                'finished appliances (a fridge, a radio, a washer) on a pallet at the right (output). anims.work = '
                'the press ram stamps, sparks burst, a warning lamp blinks (chimney smoke = the game\'s soft fx_smoke '
                'at fxPoints.smoke, not baked). workSpot = the operator at the screen-LEFT corner of the press table, '
                'in profile facing E (the press + sparks stay visible), inPoint = ingots pad (front-left), outPoint = '
                'appliance pad (right).')


@lgx('appliance_factory', 'station', 'lgx_producers', fp=(3.0, 3.0), front='-Y', catcher=22.0, work=4, fps=8,
     samples=48, notes=FACTORY_NOTE, extra={'name': {'ko': '가전 공장', 'en': 'Appliance factory'},
                                             'chain': {'in': 'item_ingot', 'out': ['item_fridge', 'item_stove_iron',
                                                                                   'item_washer', 'item_radio',
                                                                                   'item_tv_retro']}})
def b_appliance_factory():
    W, Y0, Y1 = 2.6, -0.05, 1.35
    D = Y1 - Y0
    yc = (Y0 + Y1) / 2
    brickm = L.brick('#B4593F', '#94442F', '#D9CFC2', scale=2.6, row_h=0.42, brick_w=0.5, snow_top=False)
    box('plinth', (W + 0.12, D + 0.12, 0.12), (0, yc, 0), mat=snowy('#8E96A3', lo=0.75, hi=0.9), bevel=0.03)
    box('walls', (W, D, 1.9), (0, yc, 0.1), mat=brickm, bevel=0.03)
    box('band', (W + 0.06, D + 0.06, 0.12), (0, yc, 1.95), mat=flat('#F4F1EA', 0.6), bevel=0.02)
    # saw-tooth roof: 3 teeth along X, glowing skylights facing -Y
    top = 2.07
    rm = L.stripes('#4E6A8A', '#425B78', 5.0, 'X', rough=0.75, soft=0.04)
    gl = T.glow_mat('skylight', 1.4)
    n = 3
    for k in range(n):
        x0 = -W / 2 + W * k / n
        x1 = x0 + W / n
        pts = [(0.0, 0.0), (D, 0.0), (D, 0.15), (0.0, 0.7)]       # profile in (y, z): high at the front
        o = extrude('tooth%d' % k, pts, x1 - x0, rot=(90, 0, 90), top=rm, side=rm, bevel=0.02)
        o.location = (x0, Y0, top)
        sk = box('sky%d' % k, (x1 - x0 - 0.12, 0.05, 0.45), ((x0 + x1) / 2, Y0 + 0.02, top + 0.1), rot=(-8, 0, 0),
                 mat=gl, bevel=0.01)
        del sk
        L.snow_slab('tsnow%d' % k, x1 - x0 - 0.05, D * 0.8, 0.07, ((x0 + x1) / 2, Y0 + D * 0.52, top + 0.36),
                    rot=(-math.degrees(math.atan2(0.55, D)), 0, 0), seed=k)
    # chimney (back left), red-white bands
    chx, chy = -0.85, 1.0
    cyl('chim', 0.17, 2.6, (chx, chy, 1.4), mat=L.stripes('#D9483B', '#F4F1EA', 2.2, 'Z', soft=0.02), segs=20,
        bevel=0.02)
    cyl('chimcap', 0.21, 0.1, (chx, chy, 4.0), mat=flat('#3B3F48', 0.5, 0.4), segs=20)
    # mint roll-up door + TV emblem sign + windows
    box('door', (1.0, 0.06, 1.25), (0.55, Y0 - 0.03, 0.12), mat=L.stripes('#7FC8B8', '#68B3A3', 7.0, 'Z',
                                                                            soft=0.05), bevel=0.02)
    box('doorframe', (1.12, 0.08, 0.1), (0.55, Y0 - 0.04, 1.37), mat=flat('#F4F1EA', 0.6), bevel=0.02)
    BA.window('fwin', (-0.6, Y0 - 0.02, 1.6), 'y-', w=0.6, h=0.42, shutters=None, frame='#F4F1EA', seed=4)
    BA.window('swin', (W / 2 + 0.02, yc, 1.6), 'x+', w=0.6, h=0.42, shutters=None, frame='#F4F1EA', seed=5)
    with L.Collect() as ce:
        X.tv_model('embtv', 0.5, 0.4, 0.4, '#C98F55')
    L.group(BA.top_level(ce.objs), 'emb_g', loc=(0.55, Y0 - 0.25, 1.48), rot=(0, 0, 0), scale=0.95)
    box('embbr', (0.5, 0.3, 0.05), (0.55, Y0 - 0.2, 1.45), mat=flat(X.INK, 0.5), bevel=0.01)
    # ---- stamping press on a steel table in front
    px_, py_, pz = 0.0, -0.85, 0.62
    tm = flat('#6E8FB5', 0.4, 0.35)
    box('ptable', (0.8, 0.6, 0.08), (px_, py_, pz - 0.08), mat=flat('#9AA4B1', 0.35, 0.5), bevel=0.02)
    for x in (px_ - 0.33, px_ + 0.33):
        for y in (py_ - 0.23, py_ + 0.23):
            box('pleg', (0.07, 0.07, pz - 0.08), (x, y, 0), mat=flat('#5A606B', 0.4, 0.5), bevel=0.01)
    for s in (-1, 1):
        box('pcol', (0.1, 0.1, 0.95), (px_ + s * 0.3, py_ + 0.15, pz), mat=tm, bevel=0.02)
    box('phead', (0.75, 0.38, 0.28), (px_, py_ + 0.1, pz + 0.95), mat=tm, bevel=0.05)
    box('phtrim', (0.79, 0.42, 0.05), (px_, py_ + 0.1, pz + 0.95), mat=flat('#F2C14E', 0.35, 0.5), bevel=0.015)
    L.snow_slab('psnow', 0.6, 0.3, 0.05, (px_, py_ + 0.1, pz + 1.23), seed=12)
    ram = L.group([cyl('rod', 0.05, 0.45, (0, 0, -0.45), mat=flat('#C3CCD8', 0.25, 0.8), segs=14),
                   box('die', (0.36, 0.3, 0.1), (0, 0, -0.52), mat=flat('#9AA4B2', 0.3, 0.75), bevel=0.02)],
                  'ram', loc=(px_, py_, pz + 0.95))
    # the part being stamped: a mint fridge door panel on the table
    box('panel', (0.3, 0.24, 0.03), (px_, py_, pz), mat=flat('#9FD8C8', 0.3), bevel=0.01)
    lamp_m = L.emissive('plamp', '#7A2A20', '#FF5A3A', 0.0)
    sphere('plamp', 0.06, (px_ + 0.32, py_ - 0.05, pz + 1.28), lamp_m, segs=14, rings=8)
    cyl('plampb', 0.05, 0.05, (px_ + 0.32, py_ - 0.05, pz + 1.2), mat=flat(X.INK, 0.5), segs=12)
    glow = L.point_light('pglow', (px_ + 0.4, py_ - 0.4, pz + 1.3), '#FF5A3A', 0.0, 0.1)
    sparks = L.Spray('spark', (px_ + 0.12, py_ - 0.1, pz + 0.08), (0.3, -0.75, 0.7),
                     L.emissive('sparkm', '#FFD45A', '#FFB347', 5.0), n=16, grav=1.8, r=0.038, spread=0.45, seed=9)
    # input crate of ingots (left) + output pallet of appliances (right)
    with L.Collect() as ci:
        X.crate_open('incr', 0.6, 0.5, 0.3)
        X.ingot_stack('ining', 2, 2, 2, loc=(0, 0, 0.2), scale=0.5)
    L.group(BA.top_level(ci.objs), 'in_g', loc=(-1.0, -0.75, 0))
    with L.Collect() as co:
        X.pallet('outpal', 0.8, 0.8, 0.12)
    L.group(BA.top_level(co.objs), 'outpal_g', loc=(1.05, -0.75, 0))
    with L.Collect() as c1:
        X.fridge_model('ofr', 0.42, 0.36, 0.7, '#9FD8C8')
    L.group(BA.top_level(c1.objs), 'ofr_g', loc=(1.2, -0.6, 0.12), rot=(0, 0, 0))
    with L.Collect() as c2:
        X.washer_model('owa', 0.4, 0.36, 0.46, '#F4F1EA')
    L.group(BA.top_level(c2.objs), 'owa_g', loc=(0.88, -0.95, 0.12), rot=(0, 0, 0))
    with L.Collect() as c3:
        X.radio_model('ora', 0.34, 0.16, 0.22, '#B9783F')
    L.group(BA.top_level(c3.objs), 'ora_g', loc=(0.88, -0.95, 0.6), rot=(0, 0, -10))
    stroke = [0.0, -0.18, -0.36, -0.18]

    def idle():
        ram.location.z = pz + 0.95
        sparks.show(False)
        L.set_emission(lamp_m, 0.3)
        glow.data.energy = 0.0

    def work(i):
        ram.location.z = pz + 0.95 + stroke[i]
        if i in (2, 3):
            sparks.set(i)
        else:
            sparks.show(False)
        on = i in (1, 2)
        L.set_emission(lamp_m, 4.0 if on else 0.8)
        glow.data.energy = 12.0 if on else 2.0

    idle()
    mark('in', (-0.9, -2.6, 0.0))
    mark('out', (2.6, -0.9, 0.0))
    ws = (px_ - 0.65, py_ - 0.65, 0.0)          # (polish) screen-left of the press, profile facing E
    mark('work', ws, facing=(1, 1, 0))
    mark('staff', ws, facing=(1, 1, 0))
    return {'idle': idle, 'work': work,
            'fx': {'press': (px_, py_, pz + 0.1), 'sparks': (px_ + 0.12, py_ - 0.1, pz + 0.12),
                   'smoke': (chx, chy, 4.3), 'input': (-1.0, -0.75, 0.6), 'output': (1.05, -0.75, 0.9),
                   'emblem': (0.55, Y0 - 0.3, 1.7)},
            'extra': {'workSpot': {'forwardM': 0.65, 'heightM': pz, 'dir': 'E',
                                   'note': 'stand at the screen-left corner of the press table facing E (profile, the '
                                           'press + sparks stay visible); draw the operator above the station sprite'}}}
