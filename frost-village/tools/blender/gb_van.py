"""
gb_van.py - the 금방 van (docs/CONTRACT_GEUMBANG.md AO.1 / AO.2): the logistics delivery van (lgx_vehicles.b_van,
imported READ-ONLY and called unchanged) with a LIVERY OVERRIDE applied at build time:

  * body bands  gold lower body, a navy belt line (where the red van has its cream pinstripe), gold, cream roof band
                (+ the van's own roof snow) - veh_lib.band_paint is wrapped for this one call only
  * emblem      the winged-parcel emblem is replaced by the symmetric 금방이 mark (gb_lib.mark), and a second mark is
                added on the left flank (both sides carry it; the right one is the one the camera sees)
  * doors       the driver door (right side, above the front wheel arch) and the two rear doors are cut out of the
                body shell as hinged leaves (an exact boolean split of the same baked shell, so the closed van looks
                like the red one), for the `door` (3 f) and `unload` (4 f) patches
  * cargo       three 금방 parcels on the cargo floor by the rear doors (rendered only in `unload`)

Same rig as delivery_van_red: same dimensions, wheels, seats, every point.  No letters anywhere on the body.
Not run directly - see gb_render.py.
"""
import math
import os
from collections import OrderedDict

import bpy  # noqa: F401
from mathutils import Vector

import bl_common as bc
import prop_lib as L
from prop_lib import flat, box
import town_lib as T
import veh_lib as VL
import veh_models as VM
import lgx_vehicles as LV
import gb_lib as G

KEY = 'gb_van'
W_ = 1.9
# (polish L1) the van paint is a touch lighter / warmer than the flat brand gold: the glossy clear-coated veh_lib paint
# renders ~10 dE2000 duller than the flat-shaded props; VAN_GOLD brings the rendered body back next to the locker / flag
VAN_GOLD = os.environ.get('GB_VAN_GOLD', '#FFC640')
GB_BANDS = [(-9, VAN_GOLD), (0.64, G.NAVY), (0.73, VAN_GOLD), (1.5, G.CREAM)]
MARK_AT = (0.5, 1.18)              # (y, z) of the side mark centre
MARK_R = 0.5                       # outer radius of the side mark (m) -> ~45 x 55 px on screen
DOOR = dict(y0=-1.64, y1=-0.86, z0=0.93, z1=1.86)          # driver door (right side, above the front arch)
REAR = dict(x=0.5, z0=0.62, z1=1.84, gap=0.012)              # rear doors (each leaf 0.5 m wide)
DOOR_ANG = [24.0, 50.0, 76.0]                                 # door anim (3 f)
REAR_ANG = [32.0, 64.0, 92.0, 106.0]                          # unload anim (4 f); f3 shows the parcels
GAP = 0.014                                                  # door seam (body cut is the leaf + this gap)

ANIMS = OrderedDict([
    ('idle', dict(frames=2, fps=6, repeat=-1, bob=[0, 1], spin=False, blink=False, smoke=False)),
    ('move', dict(frames=4, fps=10, repeat=-1, bob=[0, 1, 1, 0], spin=True, blink=False, smoke=False)),
    ('door', dict(frames=3, fps=10, repeat=0, bob=[0, 0, 0], spin=False, blink=False, smoke=False)),
    ('unload', dict(frames=4, fps=8, repeat=0, bob=[0, 0, 0, 0], spin=False, blink=False, smoke=False)),
    ('turn', dict(frames=1, fps=1, repeat=0, bob=[0], spin=False, blink=False, smoke=False)),
])
NOTE = ('금방 van (4.4 m): the retro delivery-van rig of delivery_van_red in the 금방 livery - honey-gold body, a navy belt '
        'line, a cream roof band + snow, frog-eye chrome lamps and a smile grille, the symmetric 금방이 mark (a gold '
        'disc with a cream parcel face and a sparkle) on both flanks, two rear doors with round windows.  No letters '
        'on the body (SW / NW / W are mirrors): the word 금방 rides on the camera-facing roof sign '
        '(gb_roofsign_*, drawn at roofSignPoint + bobPx, never flipped).  2 seats (seat 0 = driver, right front).')


def _mark_emblem(s=1.0):
    """Called by lgx_vehicles.b_van in place of its winged-parcel emblem (sign frame, scale s = 1.1)."""
    G.mark(2.0 * MARK_R, depth=0.42, name='gbem')


def _obj(name):
    return bpy.data.objects.get(name)


def _objs(prefix):
    return [o for o in bpy.data.objects if o.name == prefix or o.name.startswith(prefix + '.')]


def _apply_bool(target, cutter, op):
    mod = target.modifiers.new('gb_' + op, 'BOOLEAN')
    mod.operation = op
    mod.object = cutter
    try:
        mod.solver = 'EXACT'
        mod.material_mode = 'TRANSFER'
    except Exception:
        pass
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(target.evaluated_get(dg), preserve_all_data_layers=False, depsgraph=dg)
    target.modifiers.clear()
    target.data = me


def _cutter(name, x0, x1, y0, y1, z0, z1):
    c = box(name, (x1 - x0, y1 - y0, z1 - z0), ((x0 + x1) / 2, (y0 + y1) / 2, z0), mat=flat('#000000'), bevel=0.0)
    c.hide_render = True
    return c


def _split(body, name, box_in, grow):
    """Exact split of the baked body shell: returns the leaf (body INTERSECT box_in) and cuts box_in grown by `grow`
    (the seam) out of the body."""
    x0, x1, y0, y1, z0, z1 = box_in
    leaf = body.copy()
    leaf.data = body.data.copy()
    leaf.name = name
    bpy.context.scene.collection.objects.link(leaf)
    leaf.parent = body.parent
    leaf.matrix_world = body.matrix_world.copy()
    ci = _cutter(name + '_ci', x0, x1, y0, y1, z0, z1)
    _apply_bool(leaf, ci, 'INTERSECT')
    co = _cutter(name + '_co', x0 - grow, x1 + grow, y0 - grow, y1 + grow, z0 - grow, z1 + grow)
    _apply_bool(body, co, 'DIFFERENCE')
    for c in (ci, co):
        bpy.data.objects.remove(c, do_unlink=True)
    return leaf


def _hinge(B, name, at, children):
    h = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(h)
    h.parent = B.body
    h.location = at
    h.rotation_mode = 'XYZ'
    bpy.context.view_layer.update()
    for o in children:
        mw = o.matrix_world.copy()
        o.parent = h
        o.matrix_world = mw
    return h


def b_gb_van(key=KEY):
    import veh_render as VR
    orig_band, orig_em = VL.band_paint, LV._parcel_emblem

    def band(name, bands, **kw):
        if name == key + '_paint':
            bands = GB_BANDS
        return orig_band(name, bands, **kw)
    VL.band_paint = band
    LV._parcel_emblem = _mark_emblem
    try:
        B = LV.b_van(key, VAN_GOLD)
    finally:
        VL.band_paint, LV._parcel_emblem = orig_band, orig_em
    # ---- side marks: move the right one, add the left one
    em = _obj('dv_em')
    em.location = (-W_ / 2 - 0.004, MARK_AT[0], MARK_AT[1])
    with L.Collect() as c:
        T.emblem_at('gb_emL', lambda s=1.0: _mark_emblem(s), (W_ / 2 + 0.004, MARK_AT[0], MARK_AT[1]), psi=90.0)
    B.adopt(c.objs)
    # ---- bake the shell booleans now, then split the doors off the baked shell
    VR.bake_booleans(B)
    body = _obj('dv_body')
    for o in _objs('dv_seam') + _objs('dv_rseam'):
        bpy.data.objects.remove(o, do_unlink=True)
    # driver door (right side = -X)
    d = DOOR
    leaf = _split(body, 'gb_door', (-W_ / 2 - 0.12, -W_ / 2 + 0.14, d['y0'], d['y1'], d['z0'], d['z1']), GAP)
    kids = [leaf] + _objs('dv_pR') + [o for o in bpy.data.objects if o.name.startswith('dv_pR_gl')] + _objs('dv_handle')
    door_h = _hinge(B, 'gb_door_hinge', (-W_ / 2 + 0.02, d['y0'] + 0.01, 0.0), kids)
    # rear doors (+Y end): move the round windows onto the leaves first
    r = REAR
    wins = [o for o in bpy.data.objects if o.name.startswith('dv_rwin') or o.name.startswith('dv_rwing')]
    for o in wins:
        o.location.x = math.copysign(0.25, o.location.x)
    handles = [o for o in bpy.data.objects if o.name.startswith('dv_rh')]
    # (polish H1) decide each window / handle's leaf ONCE, in body space, before any re-parenting: the old test read
    # o.location.x after the R pass had re-parented the R parts to the R hinge (x then relative to the hinge, > 0),
    # so every window and handle ended up on the L leaf and floated off the R leaf when the doors swung open
    bpy.context.view_layer.update()
    binv = body.matrix_world.inverted()
    side_of = {o.name: ('R' if (binv @ o.matrix_world.translation).x < 0 else 'L') for o in wins + handles}
    legs = {}
    for side, (x0, x1) in (('R', (-r['x'], -r['gap'] / 2)), ('L', (r['gap'] / 2, r['x']))):
        lf = _split(body, 'gb_rear' + side, (x0, x1, 1.9, 2.4, r['z0'], r['z1']), GAP * 0.6)
        mine = [o for o in wins + handles if side_of[o.name] == side]
        hx = -r['x'] if side == 'R' else r['x']
        legs[side] = _hinge(B, 'gb_rear_hinge' + side, (hx, 2.13, 0.0), [lf] + mine)
    # cargo: three 금방 parcels by the rear doors + a little cargo lamp (unload only)
    with L.Collect() as c:
        G.gb_parcel('gbc0', 0.5, 0.36, 0.34, loc=(-0.25, 1.86, 0.49), rot_z=4, sticker=True)
        G.gb_parcel('gbc1', 0.4, 0.32, 0.28, loc=(0.3, 1.9, 0.49), rot_z=-6, sticker=True)
        G.gb_parcel('gbc2', 0.36, 0.3, 0.26, loc=(-0.22, 1.86, 0.83), rot_z=-8, sticker=True)
    B.adopt(c.objs)
    cargo = [o for o in c.objs]
    lamp = L.point_light('gb_cargolamp', (0.0, 1.35, 1.7), 'window', 35.0, 0.3)
    lamp.parent = B.body
    for o in cargo:
        o['veh_interior'] = True

    def hook(anim, i, n):
        a = DOOR_ANG[i] if anim == 'door' else 0.0
        door_h.rotation_euler = (0.0, 0.0, math.radians(a))
        ra = REAR_ANG[i] if anim == 'unload' else 0.0
        legs['R'].rotation_euler = (0.0, 0.0, math.radians(ra))
        legs['L'].rotation_euler = (0.0, 0.0, math.radians(-ra))
        show = anim == 'unload'
        for o in cargo:
            o.hide_render = not show
        lamp.hide_render = not show
    B.hooks.append(hook)
    hook('idle', 0, 2)
    # new points (body-local; the pack converts per dir)
    B.point('roofSignPoint', (0.0, -0.35, 2.36))
    B.extra_points = {
        'parcelPoints': [(-0.25, 1.86, 0.49 + 0.34), (0.3, 1.9, 0.49 + 0.28), (-0.22, 1.86, 0.83 + 0.26)],
        'parcelGround': [(-0.25, 1.86, 0.0), (0.3, 1.9, 0.0), (-0.22, 1.86, 0.0)],
    }
    B.gb = {'door': door_h, 'rear': legs, 'cargo': cargo,
            'rearParts': {side: [o for o in wins + handles if side_of[o.name] == side] for side in ('R', 'L')}}
    return B
