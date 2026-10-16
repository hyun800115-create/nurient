"""
of_parts.py - officefolk parts (CONTRACT_V42 AJ): the office wardrobe extras and the eleven new parts.

Imports tf_parts + tf2_parts (never edited) and registers the new parts into the same tf_parts.PARTS registry
(in this process only) with the same @part(...) decorator and conventions.

  part                 family   space  ages    what
  acc_sleeves          detail   body   adult   clerk's cuff over-sleeves (토시) on both forearms, tint 'acc'
  acc_bell_pin         detail   body   adult   little gold jingle bell (딸랑이) with a red bow on the left chest
  acc_bowtie           detail   body   adult   the tellers' bow tie at the collar, tint 'acc2' (polish M6: det_bow
                                               shares the shirt's slot top2, so on a vest shirt it vanished)
  held_receiver        held     body   (anim)  black candlestick-phone receiver with a brass ring (no cord)
  held_pen             held     body   (anim)  white quill pen with a blue-grey tip band and a brass nib
  held_stamp           held     body   (anim)  wooden stamp: turned handle + knob, red rubber base
  held_letter          held     body   (anim)  'sheet' an opened cream letter (desk_read), 'env' an envelope with a
                                               red heart seal (file)
  held_notebook        held     body   (anim)  teal spiral notebook (left mitten) + 'pencil' (right mitten)
  held_pointer         held     body   (anim)  thin wooden pointer stick with a black rubber tip
  held_sack_open       held     body   (anim)  burlap coin sack held open by its rim, coins inside, gold coin emblem
  held_coins           held     body   (anim)  'stack' of gold coins in the left mitten + one 'coin' in the right
  held_sack_shoulder   held     body   (anim)  burlap coin sack with a gold coin emblem slung over the right shoulder

Every held item is an anim item (tag 'anim_item': drawn only in its anims, added by the compositor) with fixed
colours (no tint) and its own joint placed in world space every frame by place_items4 (the renderer calls it
after posing): the joints are children of the root, so items never inherit the body proportions.

New tint slots: none.  Proportions: items are scaled by item_scale(age) (elder 0.95).
"""
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

import tf_parts as tp                     # noqa: E402
import tf2_parts as tp2                   # noqa: E402,F401  (v5 parts registered: longskirt fix etc.)
import of_anim as oa                      # noqa: E402

PARTS = tp.PARTS
Z = dict(tp.Z)
part, sub = tp.part, tp.sub
PI = math.pi

# new z keys (manifest 'z' as of_<key>)
Z4 = {'item': 45.0, 'pin': 44.6, 'sack_shoulder': {'S': 45.0, 'SE': 45.0, 'E': 45.0, 'NE': 92.0, 'N': 92.0}}

NEW_WEAR4 = ['acc_sleeves', 'acc_bell_pin', 'acc_bowtie']
ANIM_ITEM_PARTS4 = ['held_receiver', 'held_pen', 'held_stamp', 'held_letter', 'held_notebook', 'held_pointer',
                    'held_sack_open', 'held_coins', 'held_sack_shoulder']
ALL_NEW4 = NEW_WEAR4 + ANIM_ITEM_PARTS4
ONLY_ANIMS4 = {it: sorted(a for a, lst in oa.ANIM_ITEMS.items() if it in lst) for it in ANIM_ITEM_PARTS4}
ONLY_ANIMS4 = {k: [a for a in oa.ORDER4 if a in v] for k, v in ONLY_ANIMS4.items()}

GOLD = '#F2B83A'
GOLD_D = '#C98E24'
BURLAP = '#C9A46E'
BURLAP_D = '#A8814E'
STRING = '#C8343A'
WOOD = '#B07A44'
WOOD_L = '#D2A36A'
PAPER = '#FBF5E6'
INK = '#2A2A30'


def _lazy():
    tp._lazy()
    global bpy, bmesh, Vector, Matrix, Quaternion, bc, g, cb, vd, tb
    import bpy                                  # noqa: F401
    import bmesh                                # noqa: F401
    from mathutils import Vector, Matrix, Quaternion       # noqa: F401
    import bl_common as bc                      # noqa: F401
    import char_geo as g                        # noqa: F401
    import char_build as cb                     # noqa: F401
    import vil_dress as vd                      # noqa: F401
    import tf_body as tb                        # noqa: F401


def M(name, color, rough=0.8, **kw):
    return tp.M(name, color, rough, **kw)


def joint(rig, name):
    if name not in rig.j:
        rig.add(name, 'root', (0, 0, 0))
    return rig.j[name]


def held(z=None, hand=None, **kw):
    d = {'tint': None, 'z': Z4['item'] if z is None else z}
    if hand:
        d['zfrontFollow'] = hand
    d.update(kw)
    return d


def coin_mesh(name, mat, parent, loc, r=0.034, h=0.011, rot=(0, 0, 0)):
    """A gold coin: a short cylinder with a raised rim ring on both faces."""
    g.mesh_obj(name, g.bm_cyl(r, r, h, seg=20, centered=True), mat, parent, loc=loc, rot=rot)


def coin_emblem(name, parent, loc, rot, r=0.055):
    """Gold coin emblem stitched on a sack: disc + embossed rim + a little pinecone-ish dot (no text)."""
    gold = M('emb_gold', GOLD, 0.35, metal=0.55)
    dark = M('emb_gold_d', GOLD_D, 0.4, metal=0.5)
    g.mesh_obj(name, g.bm_cyl(r, r, 0.010, seg=28, centered=True), gold, parent, loc=loc, rot=rot)
    g.mesh_obj(name + '_rim', g.bm_ring(r * 0.78, 0.0065, seg=28, segr=6), dark, parent, loc=loc, rot=rot)
    g.mesh_obj(name + '_dot', g.bm_ellipsoid(r * 0.30, r * 0.30, 0.008, 12, 6), dark, parent, loc=loc, rot=rot)


# =========================================================================== wearables

@part('acc_sleeves', 'detail', 'body',
      {'R': {'tint': 'acc', 'z': Z['arm'] + 0.5, 'follow': 'arm_R'},
       'L': {'tint': 'acc', 'z': Z['arm'] + 0.5, 'follow': 'arm_L'}},
      tags=['job', 'office'], ages=['adult'], label={'ko': '토시', 'en': 'cuff sleeves'})
def b_acc_sleeves(rig, ctx, put):
    """Over-sleeves on both forearms: a soft cotton tube, gathered by elastic at the wrist and below the elbow."""
    _lazy()
    m = M('sleeves', ctx.col('acc'), 0.92)
    md = M('sleeves_d', ctx.col('acc', 0.80), 0.92)
    for s in ('R', 'L'):
        j = rig.j['el_' + s]
        with put(s):
            prof = [(0.076, -0.112), (0.088, -0.100), (0.094, -0.078), (0.094, -0.050), (0.090, -0.026),
                    (0.080, -0.012)]
            tube = g.bm_lathe(prof, seg=28, smooth_n=14, cap_top=False, cap_bottom=False)
            g.mesh_obj('cuff_tube', vd.fuzz(tube, 0.0025, 70.0), m, j)
            for z in (-0.108, -0.016):
                g.mesh_obj('cuff_band', g.bm_ring(0.080, 0.010, seg=28, segr=6), md, j, loc=(0, 0, z))


@part('acc_bell_pin', 'detail', 'body', {'main': {'tint': None, 'z': Z4['pin']}},
      tags=['job', 'courier'], ages=['adult'], label={'ko': '방울 브로치', 'en': 'bell pin'})
def b_acc_bell_pin(rig, ctx, put):
    """A gold jingle bell with a red bow pinned on the left chest (the courier's name 딸랑이)."""
    _lazy()
    gold = M('bell_gold', '#F4C042', 0.25, metal=0.75)
    dark = M('bell_dark', '#8A5A1A', 0.4, metal=0.4)
    red = M('bell_bow', '#D8343C', 0.55)
    j = rig.j['spine']
    x, y, z = 0.110, -0.240, 0.245
    k = 1.85                                       # (scaled up: the courier's namesake must read at phone zoom 0.6)
    prof = [(0.0, -0.040 * k), (0.030 * k, -0.036 * k), (0.040 * k, -0.020 * k), (0.038 * k, 0.0),
            (0.030 * k, 0.018 * k), (0.016 * k, 0.030 * k), (0.0, 0.034 * k)]
    with put('main'):
        bell = g.bm_lathe(prof, seg=24, smooth_n=12)
        g.mesh_obj('bell', bell, gold, j, loc=(x, y - 0.01, z), rot=(-12, 0, 0))
        g.mesh_obj('bell_slot', g.bm_box(0.050 * k, 0.010, 0.008 * k, bevel=0.003), dark, j,
                   loc=(x, y - 0.010 - 0.036 * k, z - 0.010 * k), rot=(-12, 0, 0))
        g.mesh_obj('bell_ball', g.bm_ellipsoid(0.010 * k, 0.010 * k, 0.010 * k, 10, 6), dark, j,
                   loc=(x, y - 0.010 - 0.022 * k, z - 0.040 * k))
        for s in (-1, 1):
            g.mesh_obj('bow_loop', g.bm_ellipsoid(0.026 * k, 0.010 * k, 0.016 * k, 12, 8), red, j,
                       loc=(x + s * 0.024 * k, y - 0.014, z + 0.046 * k), rot=(-10, s * -18, 0))
            g.mesh_obj('bow_tail', g.bm_box(0.012 * k, 0.006, 0.030 * k, bevel=0.003), red, j,
                       loc=(x + s * 0.012 * k, y - 0.020, z + 0.022 * k), rot=(-10, s * 16, 0))
        g.mesh_obj('bow_knot', g.bm_ellipsoid(0.012 * k, 0.010 * k, 0.012 * k, 10, 6), red, j,
                   loc=(x, y - 0.020, z + 0.046 * k))


@part('acc_bowtie', 'detail', 'body', {'main': {'tint': 'acc2', 'z': Z['job_detail'] + 0.5}},
      tags=['job', 'office'], ages=['adult'], label={'ko': '나비넥타이', 'en': 'bow tie'})
def b_acc_bowtie(rig, ctx, put):
    """A neat satin bow tie at the shirt collar (tellers): two pleated wings and a knot, tint acc2."""
    _lazy()
    m = M('bowtie', ctx.col('acc2'), 0.45)
    md = M('bowtie_d', ctx.col('acc2', 0.78), 0.5)
    j = rig.j['chest']
    y0, z0 = -0.180, 0.036
    with put('main'):
        for s_ in (-1, 1):
            wing = g.bm_slab([(0.0, -0.018), (0.060, -0.040), (0.070, 0.0), (0.060, 0.040), (0.0, 0.018)], 0.022,
                             bevel=0.009)
            # (bm_slab outlines are (y, z), extruded along x: turn the outline to face the front, wing to +-x)
            g.mesh_obj('bt_wing', wing, m, j, loc=(s_ * 0.010, y0, z0), rot=(0, 0, -90 * s_))
            g.mesh_obj('bt_pleat', g.bm_box(0.007, 0.008, 0.052, bevel=0.002), md, j,
                       loc=(s_ * 0.042, y0 - 0.012, z0), rot=(0, 0, 0))
        g.mesh_obj('bt_knot', g.bm_ellipsoid(0.020, 0.016, 0.022, 12, 8), m, j, loc=(0, y0 - 0.010, z0))


# =========================================================================== held items (anim items)

@part('held_receiver', 'held', 'body', {'main': held(hand='hand_R')}, tags=['anim_item', 'office'],
      label={'ko': '수화기', 'en': 'phone receiver'})
def b_held_receiver(rig, ctx, put):
    """Candlestick-phone receiver on joint rcv_J: local +Z points from the fist to the ear (the cup)."""
    _lazy()
    j = joint(rig, 'rcv_J')
    blk = M('rcv_black', '#25262C', 0.32)
    brass = M('rcv_brass', '#E2B13C', 0.3, metal=0.75)
    with put('main'):
        g.mesh_obj('rcv_handle', g.bm_cyl(0.019, 0.016, 0.13, seg=16, centered=True), blk, j, loc=(0, 0, -0.03))
        cup = g.bm_lathe([(0.016, 0.0), (0.024, 0.02), (0.040, 0.045), (0.044, 0.058), (0.030, 0.062)], seg=24,
                         smooth_n=10, cap_bottom=False, cap_top=True)
        g.mesh_obj('rcv_cup', cup, blk, j, loc=(0, 0, 0.03))
        g.mesh_obj('rcv_ring', g.bm_ring(0.022, 0.006, seg=20, segr=6), brass, j, loc=(0, 0, 0.032))
        g.mesh_obj('rcv_end', g.bm_ellipsoid(0.020, 0.020, 0.014, 14, 8), blk, j, loc=(0, 0, -0.098))


@part('held_pen', 'held', 'body', {'main': held(hand='hand_R')}, tags=['anim_item', 'office'],
      label={'ko': '깃펜', 'en': 'quill pen'})
def b_held_pen(rig, ctx, put):
    """A big white quill on joint pen_J: origin = the nib, local +Z up along the shaft to the feather tip."""
    _lazy()
    j = joint(rig, 'pen_J')
    white = M('quill_w', '#FBFAF4', 0.6)
    grey = M('quill_g', '#C9D3E2', 0.6)
    band = M('quill_band', '#3D7CC9', 0.5)
    nib = M('quill_nib', '#C9A045', 0.3, metal=0.6)
    with put('main'):
        g.mesh_obj('nib', g.bm_cyl(0.002, 0.010, 0.04, seg=10), nib, j, loc=(0, 0, 0.0))
        g.mesh_obj('shaft', g.bm_cyl(0.008, 0.004, 0.30, seg=10), white, j, loc=(0, 0, 0.04))
        vane = g.bm_lathe([(0.0, 0.0), (0.032, 0.03), (0.046, 0.10), (0.040, 0.18), (0.022, 0.24), (0.0, 0.27)],
                          seg=20, sx=1.0, sy=0.16, smooth_n=14)
        g.mesh_obj('vane', vd.fuzz(vane, 0.002, 90.0), white, j, loc=(0.010, 0, 0.08), rot=(0, -8, 0))
        g.mesh_obj('vane_tip', g.bm_ellipsoid(0.022, 0.007, 0.030, 12, 6), grey, j, loc=(0.010, 0, 0.32))
        g.mesh_obj('vane_band', g.bm_box(0.074, 0.012, 0.016, bevel=0.004), band, j, loc=(0.010, 0, 0.115),
                   rot=(0, -8, 0))


@part('held_stamp', 'held', 'body', {'main': held(hand='hand_R')}, tags=['anim_item', 'office'],
      label={'ko': '도장', 'en': 'rubber stamp'})
def b_held_stamp(rig, ctx, put):
    """Wooden stamp on joint stamp_J: origin = in the fist (the knob), the red rubber base 0.10 m below."""
    _lazy()
    j = joint(rig, 'stamp_J')
    wood = M('stamp_wood', WOOD, 0.55)
    wl = M('stamp_wood_l', WOOD_L, 0.55)
    red = M('stamp_red', '#D23A3A', 0.5)
    with put('main'):
        g.mesh_obj('stamp_knob', g.bm_ellipsoid(0.032, 0.032, 0.028, 16, 10), wl, j, loc=(0, 0, 0.0))
        g.mesh_obj('stamp_neck', g.bm_cyl(0.017, 0.022, 0.05, seg=14), wood, j, loc=(0, 0, -0.065))
        g.mesh_obj('stamp_block', g.bm_box(0.085, 0.065, 0.030, bevel=0.008), wl, j, loc=(0, 0, -0.080))
        g.mesh_obj('stamp_base', g.bm_box(0.090, 0.070, 0.020, bevel=0.005), red, j, loc=(0, 0, -0.102))


@part('held_letter', 'held', 'body',
      {'sheet': held(hand='hand_R', onlyAnims=['desk_read']), 'env': held(hand='hand_R', onlyAnims=['file'])},
      tags=['anim_item', 'office'], label={'ko': '편지', 'en': 'letter'})
def b_held_letter(rig, ctx, put):
    """'sheet': an opened letter between both mittens (joint letter_J, the sheet in local XZ, its written face
    toward local +Y = the reader); 'env': a cream envelope with a red heart seal in the right mitten (env_J)."""
    _lazy()
    jl = joint(rig, 'letter_J')
    je = joint(rig, 'env_J')
    paper = M('letter_paper', PAPER, 0.7)
    line = M('letter_line', '#A9B6C9', 0.7)
    seal = M('letter_seal', '#D8343C', 0.4)
    with put('sheet'):
        for k, (dz, tl) in enumerate(((0.048, 6), (-0.048, -6))):        # folded in two: a soft crease
            g.mesh_obj('sheet', g.bm_box(0.17, 0.006, 0.100, bevel=0.003), paper, jl, loc=(0, 0.004 * k, dz),
                       rot=(tl, 0, 0))
        for k in range(4):
            for s, yy in ((-1, -0.0045), (1, 0.0045)):
                g.mesh_obj('sheet_line', g.bm_box(0.11 - 0.03 * (k == 3), 0.002, 0.007, bevel=0.0), line, jl,
                           loc=(-0.015 * (k == 3), yy, 0.075 - 0.045 * k))
    with put('env'):
        g.mesh_obj('env', g.bm_box(0.165, 0.010, 0.115, bevel=0.006), paper, je, loc=(0, 0, 0))
        g.mesh_obj('env_flap', g.bm_slab([(-0.08, 0.0), (0.08, 0.0), (0.0, -0.05)], 0.004, bevel=0.002),
                   M('letter_flap', '#EFE6CF', 0.7), je, loc=(0, -0.007, 0.055), rot=(90, 0, 0))
        for s in (-1, 1):
            g.mesh_obj('env_seal', g.bm_ellipsoid(0.014, 0.008, 0.014, 10, 6), seal, je,
                       loc=(s * 0.009, -0.010, 0.012), rot=(0, s * 30, 0))
        g.mesh_obj('env_seal_p', g.bm_ellipsoid(0.012, 0.008, 0.016, 10, 6), seal, je, loc=(0, -0.010, 0.002))


@part('held_notebook', 'held', 'body', {'book': held(hand='hand_L'), 'pencil': held(hand='hand_R')},
      tags=['anim_item', 'office'], label={'ko': '스프링 수첩', 'en': 'spiral notebook'})
def b_held_notebook(rig, ctx, put):
    """Small teal spiral notebook (joint book_J: open, the page facing local +Y = the writer) + a yellow pencil
    (joint pencil_J: lead at the origin, local +Z up the pencil)."""
    _lazy()
    jb = joint(rig, 'book_J')
    jp = joint(rig, 'pencil_J')
    cover = M('nb_cover', '#2E8A8A', 0.55)
    page = M('nb_page', PAPER, 0.7)
    wire = M('nb_wire', '#D7DFE8', 0.25, metal=0.8)
    line = M('nb_line', '#9CC7E6', 0.7)
    with put('book'):
        g.mesh_obj('nb_back', g.bm_box(0.120, 0.012, 0.150, bevel=0.010), cover, jb, loc=(0, -0.008, 0))
        g.mesh_obj('nb_pages', g.bm_box(0.108, 0.010, 0.138, bevel=0.004), page, jb, loc=(0, 0.004, -0.002))
        for k in range(4):
            g.mesh_obj('nb_line', g.bm_box(0.08, 0.002, 0.005, bevel=0.0), line, jb, loc=(0, 0.010, 0.035 - 0.028 * k))
        for k in range(6):
            g.mesh_obj('nb_ring', g.bm_ring(0.011, 0.003, seg=12, segr=4), wire, jb,
                       loc=(-0.045 + 0.018 * k, 0.0, 0.078), rot=(0, 90, 0))
        g.mesh_obj('nb_band', g.bm_box(0.012, 0.016, 0.152, bevel=0.003), M('nb_band', '#F2C14E', 0.5), jb,
                   loc=(0.046, -0.010, 0))
    with put('pencil'):
        g.mesh_obj('pc_lead', g.bm_cyl(0.002, 0.009, 0.026, seg=8), M('pc_wood', '#E8C79A', 0.6), jp)
        g.mesh_obj('pc_body', g.bm_cyl(0.010, 0.010, 0.11, seg=6), M('pc_yellow', '#F2C230', 0.5), jp,
                   loc=(0, 0, 0.026))
        g.mesh_obj('pc_band', g.bm_cyl(0.011, 0.011, 0.014, seg=10), M('pc_band', '#C9CFD8', 0.3, metal=0.6), jp,
                   loc=(0, 0, 0.136))
        g.mesh_obj('pc_eraser', g.bm_ellipsoid(0.010, 0.010, 0.012, 10, 6), M('pc_eraser', '#F08A9A', 0.6), jp,
                   loc=(0, 0, 0.154))


POINTER_L = 0.56


@part('held_pointer', 'held', 'body', {'main': held(hand='hand_R')}, tags=['anim_item', 'office'],
      label={'ko': '지시봉', 'en': 'pointer stick'})
def b_held_pointer(rig, ctx, put):
    """Pointer stick on joint ptr_J: origin = in the fist, the stick along local +Z to the rubber tip."""
    _lazy()
    j = joint(rig, 'ptr_J')
    with put('main'):
        g.mesh_obj('ptr_grip', g.bm_cyl(0.016, 0.014, 0.10, seg=12, centered=False), M('ptr_grip', '#7A4A2A', 0.5), j,
                   loc=(0, 0, -0.05))
        g.mesh_obj('ptr_stick', g.bm_cyl(0.012, 0.007, POINTER_L - 0.05, seg=10), M('ptr_wood', WOOD_L, 0.5), j,
                   loc=(0, 0, 0.05))
        g.mesh_obj('ptr_tip', g.bm_ellipsoid(0.011, 0.011, 0.020, 10, 6), M('ptr_tip', INK, 0.5), j,
                   loc=(0, 0, POINTER_L))


def _sack_body(j, prof, open_mouth=False):
    burlap = M('burlap4', BURLAP, 0.95)
    bm = vd.fuzz(g.bm_lathe(prof, seg=28, sy=0.88, smooth_n=16, cap_top=not open_mouth, cap_bottom=True), 0.004, 45.0)
    return g.mesh_obj('sack', bm, burlap, j)


@part('held_sack_open', 'held', 'body', {'main': held(hand='hand_R')}, tags=['anim_item', 'courier'],
      label={'ko': '열린 돈 자루', 'en': 'open coin sack'})
def b_held_sack_open(rig, ctx, put):
    """Burlap coin sack held open by its rim (joint sacko_J at the rim centre between the mittens, +Z up):
    coins heaped inside, a gold coin emblem on the front (-Y), the red string hanging loose."""
    _lazy()
    j = joint(rig, 'sacko_J')
    gold = M('coin_gold', GOLD, 0.3, metal=0.6)
    with put('main'):
        prof = [(0.0, -0.27), (0.10, -0.262), (0.150, -0.21), (0.160, -0.13), (0.142, -0.05), (0.120, -0.01),
                (0.126, 0.012)]
        _sack_body(j, prof, open_mouth=True)
        g.mesh_obj('sack_rim', g.bm_ring(0.122, 0.016, seg=28, segr=6, sy=0.88), M('burlap_d', BURLAP_D, 0.95), j,
                   loc=(0, 0, 0.008))
        g.mesh_obj('sack_inside', g.bm_ellipsoid(0.108, 0.094, 0.020, 20, 8), M('sack_dark', '#6B4A2A', 0.95), j,
                   loc=(0, 0, -0.012))
        for k, (dx, dy, dz, tl) in enumerate(((0.0, 0.0, 0.010, 0), (-0.045, 0.02, 0.004, 25), (0.05, -0.015, 0.006, -20),
                                              (0.015, 0.045, 0.002, 40), (-0.02, -0.04, 0.012, -35))):
            coin_mesh('sack_coin', gold, j, (dx, dy, dz), r=0.030, h=0.010, rot=(tl, tl * 0.5, 0))
        coin_emblem('sack_emb', j, (0.0, -0.140, -0.130), (90, 0, 0), r=0.050)
        sm = M('sack_string', STRING, 0.7)
        g.mesh_obj('sack_string', g.bm_tube_path([(0.11, -0.05, 0.0), (0.15, -0.09, -0.05), (0.14, -0.10, -0.11)],
                                                 0.007, segr=6), sm, j)


@part('held_coins', 'held', 'body', {'stack': held(hand='hand_L'), 'coin': held(hand='hand_R')},
      tags=['anim_item', 'courier'], label={'ko': '동전', 'en': 'coins'})
def b_held_coins(rig, ctx, put):
    """'stack': five gold coins on the left mitten (joint coins_J, +Z up); 'coin': one coin pinched in the right
    mitten (joint coin_J, standing up)."""
    _lazy()
    js = joint(rig, 'coins_J')
    jc = joint(rig, 'coin_J')
    gold = M('coin_gold', GOLD, 0.3, metal=0.6)
    rim = M('coin_rim', GOLD_D, 0.35, metal=0.55)
    with put('stack'):
        for k in range(5):
            coin_mesh('stack_coin', gold, js, (0.004 * math.sin(k * 2.1), 0.003 * math.cos(k * 1.7), 0.013 * k),
                      r=0.036, h=0.012)
            g.mesh_obj('stack_rim', g.bm_ring(0.036, 0.0035, seg=20, segr=4), rim, js, loc=(0, 0, 0.013 * k + 0.006))
    with put('coin'):
        coin_mesh('one_coin', gold, jc, (0, 0, 0), r=0.036, h=0.012, rot=(90, 0, 0))
        g.mesh_obj('one_rim', g.bm_ring(0.028, 0.004, seg=20, segr=4), rim, jc, loc=(0, -0.007, 0), rot=(90, 0, 0))


@part('held_sack_shoulder', 'held', 'body', {'main': held(z=Z4['sack_shoulder'])},
      tags=['anim_item', 'courier'], label={'ko': '어깨 돈 자루', 'en': 'coin sack (shoulder)'})
def b_held_sack_shoulder(rig, ctx, put):
    """Coin sack slung over the right shoulder: the tied neck in the fist (joint sackn_J at the fist), the body
    hanging down the back (joint sackb_J, placed + bounced per frame by place_items4; local +Y = backward,
    -X = the character's right), a big gold coin emblem on its back face, coins peeking out of the neck."""
    _lazy()
    jn = joint(rig, 'sackn_J')
    jb = joint(rig, 'sackb_J')
    burlap = M('burlap4', BURLAP, 0.95)
    bd = M('burlap_d', BURLAP_D, 0.95)
    gold = M('coin_gold', GOLD, 0.3, metal=0.6)
    sm = M('sack_string', STRING, 0.7)
    with put('main'):
        # neck: gathered burlap above the fist + red string + two coins peeking
        g.mesh_obj('neck', vd.fuzz(g.bm_lathe([(0.028, -0.05), (0.034, 0.0), (0.044, 0.035), (0.050, 0.055),
                                               (0.0, 0.066)], seg=18, smooth_n=8), 0.003, 50.0), bd, jn)
        g.mesh_obj('tie', g.bm_ring(0.034, 0.010, seg=18, segr=6), sm, jn, loc=(0, 0, 0.012))
        for s in (-1, 1):
            g.mesh_obj('tie_end', g.bm_tube_path([(s * 0.03, -0.01, 0.012), (s * 0.05, -0.02, -0.02),
                                                  (s * 0.045, -0.02, -0.05)], 0.006, segr=6), sm, jn)
        coin_mesh('neck_coin', gold, jn, (0.012, 0.0, 0.060), r=0.024, h=0.008, rot=(60, 20, 0))
        # body: a plump pear of burlap hanging behind the shoulder (+Y), bottom down
        prof = [(0.0, -0.20), (0.10, -0.192), (0.152, -0.15), (0.168, -0.07), (0.152, 0.01), (0.110, 0.07),
                (0.060, 0.11), (0.040, 0.13)]
        bm = vd.fuzz(g.bm_lathe(prof, seg=28, sx=1.0, sy=0.86, smooth_n=16, cap_top=True), 0.004, 45.0)
        g.mesh_obj('sack', bm, burlap, jb)
        g.mesh_obj('sack_patch', g.bm_box(0.05, 0.012, 0.045, bevel=0.006), bd, jb, loc=(-0.10, 0.10, -0.12),
                   rot=(0, 0, 40))
        coin_emblem('sack_emb', jb, (0.0, 0.145, -0.05), (90, 0, 0), r=0.062)
        coin_emblem('sack_emb_s', jb, (-0.162, 0.0, -0.06), (0, 90, 0), r=0.050)
        # (polish M5) a big emblem on the front-right face too: the one the camera sees in S / SE / E
        coin_emblem('sack_emb_f', jb, (-0.121, -0.104, -0.065), (90, 0, -45), r=0.060)
        # the gathered burlap between the neck and the body, over the shoulder top
        # (bm_capsule hangs along -Z: rotated -122 deg about X it runs forward (-Y) and up toward the fist)
        g.mesh_obj('drape', vd.fuzz(g.bm_capsule(0.055, 0.16, r_end=0.040, seg=16, rings=8), 0.003, 50.0), bd, jb,
                   loc=(0, -0.02, 0.10), rot=(-122, 0, 0))


for _pn in ALL_NEW4:
    if _pn in ONLY_ANIMS4:
        PARTS[_pn].only_anims = list(ONLY_ANIMS4[_pn])


# --------------------------------------------------------------------------- per-frame item placement

def item_scale(age):
    return {'child': 0.85, 'elder': 0.95}.get(age, 1.0)


def _set(rig, name, loc_world, quat_root=None, on=True, scale=1.0):
    """Joint `name` (a root child) at world position loc_world, rotation quat_root in the ROOT (facing) frame."""
    if name not in rig.j:
        return
    root = rig.j['root']
    jn = rig.j[name]
    jn.location = root.matrix_world.inverted() @ loc_world
    jn.rotation_quaternion = quat_root if quat_root is not None else Quaternion()
    k = scale if on else 1e-4
    jn.scale = (k, k, k)


def _dir_quat(v, up=(0, 0, 1)):
    """Quaternion turning local +Z onto vector v (root frame), keeping local +Y near 'up'-ish."""
    v = Vector(v).normalized()
    return v.to_track_quat('Z', 'Y')


def place_items4(rig, d, flags, anim=None):
    """Place every officefolk item joint after Rig.apply + IK (world space; joints are root children).
    Hidden items (other keys of the anim) are scaled to ~0 so their frames come out empty.
    Returns item points (world): {'hand': mid of the mittens (hand_over), 'impact': stamp contact,
    'sack': coin target (scoop: the sack mouth; carry_sack: the sack body), 'pen': nib}."""
    _lazy()
    bpy.context.view_layer.update()
    root = rig.j['root']
    rq = root.matrix_world.to_quaternion()
    rqi = rq.inverted()
    age = rig.meta.get('ch', {}).get('age', 'adult')
    s = item_scale(age)
    out = {}
    hr = rig.world('hand_R')
    hl = rig.world('hand_L')
    up = rq @ Vector((0, 0, 1))
    fwd = rq @ Vector((0, -1, 0))
    right = rq @ Vector((-1, 0, 0))            # the character's right

    def rootdir(x, y, z):
        return Vector((x, y, z))

    # receiver: fist -> toward the ear (head centre)
    if 'rcv_J' in rig.j:
        on = bool(flags.get('_receiver'))
        head = rig.world('head', (0, 0, 0.27))
        v_world = (head - hr)
        v_root = rqi @ v_world
        q = _dir_quat(v_root)
        _set(rig, 'rcv_J', hr + v_world.normalized() * 0.035, q, on, s * oa.ITEM_K['held_receiver'])
    # quill: nib under the fist, feather leaning up, back and outward
    if 'pen_J' in rig.j:
        on = bool(flags.get('_pen'))
        q = _dir_quat(rootdir(-0.55, 0.05, 1.0))              # feather up and out to the writer's right
        nib = hr + up * -0.050 + fwd * 0.015
        _set(rig, 'pen_J', nib, q, on, s)
        out['pen'] = nib
    # stamp: knob in the fist, base straight down
    if 'stamp_J' in rig.j:
        on = bool(flags.get('_stamp'))
        q = Quaternion((1, 0, 0), math.radians(-6))
        ks = s * oa.ITEM_K['held_stamp']
        _set(rig, 'stamp_J', hr + up * 0.012, q, on, ks)
        out['impact'] = hr + up * (0.012 - 0.112 * ks)
    # letter sheet between both mittens (desk_read) / envelope in the right mitten (file)
    if 'letter_J' in rig.j:
        mode = flags.get('_letter')
        mid = (hr + hl) * 0.5 + up * 0.055
        # sheet faces the reader (+Y local = back toward the body), top leaning away 18 deg
        q = Quaternion((1, 0, 0), math.radians(-18))
        tilt = (rqi @ (hl - hr)).z
        q = q @ Quaternion((0, 1, 0), math.atan2(tilt, 0.20) * -0.8)
        _set(rig, 'letter_J', mid, q, mode == 'read', s)
        q2 = Quaternion((1, 0, 0), math.radians(-10))
        _set(rig, 'env_J', hr + up * 0.06 + fwd * 0.02, q2, mode == 'post', s)
    # notebook in the left mitten, pencil in the right
    if 'book_J' in rig.j:
        on = bool(flags.get('_note'))
        q = Quaternion((1, 0, 0), math.radians(-38)) @ Quaternion((0, 0, 1), math.radians(-14))
        _set(rig, 'book_J', hl + up * 0.05 + fwd * 0.01 + right * 0.03, q, on, s)
        qp = _dir_quat(rootdir(-0.25, 0.30, 1.0))
        _set(rig, 'pencil_J', hr + up * -0.045 + fwd * 0.012, qp, on, s)
    # pointer: from the fist forward and up (pitch from the flag), slightly inward
    if 'ptr_J' in rig.j:
        pitch = flags.get('_pointer')
        on = pitch is not None
        pt = math.radians(pitch or 0.0)
        inw = flags.get('_pointer_in', 0.12)                  # + = toward the character's left
        q = _dir_quat(rootdir(inw, -math.cos(pt), math.sin(pt)))
        _set(rig, 'ptr_J', hr, q, on, s)
        if on:
            out['tip'] = hr + rq @ (Vector((inw, -math.cos(pt), math.sin(pt))).normalized() * POINTER_L * s)
    # open sack: rim centre between the mittens; key 3 = lifted and tipped toward the camera (jingle)
    if 'sacko_J' in rig.j:
        k = flags.get('_sack_open')
        on = k is not None
        mid = (hr + hl) * 0.5 + up * 0.01
        q = Quaternion((1, 0, 0), math.radians({0: 4, 1: 10, 2: 18, 3: -6}.get(k or 0, 0)))
        _set(rig, 'sacko_J', mid, q, on, s)
        out['sack'] = mid - up * 0.012                     # just inside the open mouth (on the coins)
    # coins: a stack on the left mitten, a single coin pinched in the right
    if 'coins_J' in rig.j:
        on = bool(flags.get('_coins'))
        _set(rig, 'coins_J', hl + up * 0.040, Quaternion(), on, s)
        _set(rig, 'coin_J', hr + up * 0.045 + fwd * 0.012, Quaternion((0, 0, 1), math.radians(20)),
             on and bool(flags.get('_coin')), s)
    # shoulder sack: neck at the fist, body hanging down the back behind the right shoulder, bouncing
    if 'sackn_J' in rig.j:
        i = flags.get('_sack')
        on = i is not None
        _set(rig, 'sackn_J', hr + up * 0.02, Quaternion((1, 0, 0), math.radians(18)), on, s)
        ch_ = rig.j['chest']
        bounce = oa.SACK_BOUNCE[(i or 0) % 8] * 0.020
        tx, ty, tz = rig.meta.get('torso_scale', (1, 1, 1))
        # (polish M5) the sack hangs OUTBOARD of the right shoulder and a little lower, turned so its front-right
        # face (with a coin emblem) shows in the front views: from the front it reads as a sack, not a waving hand
        hang = oa.SACK_HANG_DIR.get(d, oa.SACK_HANG)
        base = ch_.matrix_world @ Vector((hang[0] * tx, hang[1] * ty, hang[2] * tz))
        swing = math.radians(5.0 * oa.SACK_BOUNCE[(i + 2) % 8] if on else 0.0)
        q = Quaternion((1, 0, 0), swing) @ Quaternion((0, 1, 0), math.radians(-14)) @ \
            Quaternion((0, 0, 1), math.radians(hang[3]))
        _set(rig, 'sackb_J', base + up * bounce, q, on, s)
        if on:                     # (polish H2) only when the shoulder sack is shown: scoop keeps its sack mouth
            out['sack'] = base + up * (bounce - 0.02) + right * 0.06
    if anim in ('hand_over',):
        out['hand'] = (hr + hl) * 0.5 + up * 0.045
    bpy.context.view_layer.update()
    return out
