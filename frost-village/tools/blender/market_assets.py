"""
market_assets.py - the first shop's stall stages (v4.2.0.2 M1: stage 1 「눈꽃 노점」), built with the SAME helpers,
palette, camera, light and PPU as the props / v3 buildings (prop_lib, prop_assets and bld_assets sub-models are
imported READ-ONLY).  market_render.py renders them into <tmp>/fv_cache/market, market_pack.py packs assets/market/.

Why a new stall (docs: 기획서_마을새단장.md ① ②, engineering_plan.md "M1"):
  * today's market_counter (prop_assets) has a 0.95 m counter and a striped awning whose front edge comes down to the
    clerk's cap: only ~48 % of the clerk showed, so she read as a child.  Stage 1 has NO awning: a wooden signboard
    on two back posts (top edge 2.6 m) whose name the GAME writes (strings.js sign_market_1 = 눈꽃 노점), a 0.6 m
    counter, and a 12 cm plank step behind it for the clerk.
  * two layers like the general store: the whole stall = `<stage>_back` (posts, shelf, sign, step ... and the counter,
    which the front layer covers anyway), then the clerk, then `<stage>_front` = ONLY the objects built inside the
    builder's `front` block (the counter and what stands on it), cut from the same render with an object mask.
  * goods-free (4.2.0.1 ghost sweep rule): no fish, bread or meat is painted on the stall - the real stock is the
    shelf pad's item tower; the shelves hold folded cloths, an empty basket, paper bags and a crock of spoons.

Builder contract (market_render.py):
    fn() -> {'front': [objects of the front layer], 'sprites': {...}, 'frames': [(name, setter)], 'fx': {...}}
    markers via bld_assets.mark(kind, loc, facing):
        staff  -> staffPoints / staffDirs (feet of the clerk ON the step: z = 0 here, the step lift is stepLiftPx)
        sign   -> 4 corners of the signboard face (top-left, top-right, bottom-right, bottom-left, local -Y face)
        customer -> where the first customer stands (diagonally front-left of the clerk, docs: >= 75 % visible)
Conventions as prop_assets / bld_assets: 1 unit = 1 m, origin = footprint centre = sprite anchor, front = -Y
(screen down-left), +X = screen down-right.  Not run directly.
"""
import math
from collections import OrderedDict

import bpy  # noqa: F401  (import before mathutils when bpy is a module)

import prop_lib as L
from prop_lib import flat, tonal, box, cyl, blob
import prop_assets as PA
import life_assets as LA
import bld_assets as BA

MARKET = OrderedDict()

STEP_H = 0.12           # the clerk's plank step (docs: 10-15 cm)
COUNTER_H = 0.60        # counter top (docs: 0.95 m -> 0.6 m)
SIGN_TOP = 2.60         # signboard top edge (docs: ~2.6 m)


def market(key, fp=(3.0, 1.3), samples=64, catcher=16.0, notes=''):
    """Register a stall stage (same spec fields as bld_assets.bld, so bld_render.render_build can render it)."""
    def deco(fn):
        MARKET[key] = dict(key=key, fn=fn, kind='building', atlas=key, fp=fp, yaw=0.0, shadow=True, samples=samples,
                           notes=notes, front='-Y', catcher=catcher, work=0, fps=8, item=None, sprites=None,
                           extra={})
        return fn
    return deco


def plank_top(name, size, loc, c1='#C98F55', c2='#B27843', n=None):
    n = n or max(3.0, size[0] / 0.28)
    return box(name, size, loc, mat=L.stripes(c1, c2, n, 'X', soft=0.03), bevel=0.02)


def basket(name, loc, r=0.16, h=0.13, seed=0):
    """An EMPTY woven basket - never filled with goods.  (v4.2.0.2 fix STALL-P4: the first one was a golden straw
    cylinder whose floor sat 3.5 cm under the rim, so from the game camera it read as a bread roll.  Now an open
    lathe shell: grey-brown wicker outside, a thin pale rim, and a deep DARK inside (wall + floor) that shows as a
    dark ellipse - an empty container, not a loaf.)"""
    wick = L.stripes('#A99474', '#8F7A5C', 9.0, 'Z', rough=0.9, soft=0.05)
    rim = flat('#C8B696', 0.85)
    dark = flat('#3E3024', 0.95)
    x, y, z = loc
    rt, t, fl = r * 1.16, 0.014, 0.022
    rows = [(r, 0.0), (rt, h), (rt - t, h), (r - t, fl)]

    def prof(j, k):
        a = j * math.tau / 24
        rr, zz = rows[k]
        return (rr * math.cos(a), rr * math.sin(a), zz)
    L.revolve(name, prof, 24, len(rows), mats=[wick, rim, dark], loc=(x, y, z), top=(0, 0, fl), bottom=(0, 0, 0),
              mat_fn=lambda j, k, part: 2 if part == 'top' or k == 2 else 1 if k == 1 else 0)
    L.smooth_tube(name + '_rim', [(x + (rt - t / 2) * math.cos(a), y + (rt - t / 2) * math.sin(a), z + h)
                                  for a in [i * math.tau / 16 for i in range(17)]], 0.011, rim)


def cloths(name, loc, n=3):
    """(v4.2.0.2 fix STALL-P4) a stack of folded striped cloths (blue / red on white): plainly linen, not food."""
    x, y, z = loc
    cols = [('#F4F1EA', '#5E86BE'), ('#F4F1EA', '#C8584A'), ('#F4F1EA', '#5E86BE')]
    for i in range(n):
        c1, c2 = cols[i % len(cols)]
        box('%s_%d' % (name, i), (0.27, 0.21, 0.04), (x + 0.012 * ((i % 2) * 2 - 1), y - 0.006 * i, z + i * 0.042),
            mat=L.stripes(c1, c2, 7.0, 'X', rough=0.95, soft=0.08), bevel=0.012)


def crock(name, loc, r=0.085, h=0.17):
    """(v4.2.0.2 fix STALL-P4) a blue glazed crock holding three wooden spoons (serving tools, not food)."""
    x, y, z = loc
    cyl(name, r, h, (x, y, z), mat=flat('#4F74A6', 0.35), segs=20, r_top=r * 0.92, bevel=0.012)
    cyl(name + '_in', r * 0.78, 0.01, (x, y, z + h - 0.008), mat=flat('#2A2F38', 0.9), segs=20)
    wood = flat('#C99A62', 0.8)
    for i, (dx, dy, tilt) in enumerate(((-0.022, 0.0, -14), (0.018, 0.012, 10), (0.004, -0.018, 3))):
        cyl('%s_spoon%d' % (name, i), 0.011, 0.2, (x + dx, y + dy, z + h - 0.11), rot=(0, tilt, 0), mat=wood, segs=8,
            bevel=0.004)


def paper_bags(name, loc, n=3):
    """A small stack of folded kraft-paper bags (what the clerk hands the goods over in)."""
    x, y, z = loc
    for i in range(n):
        box('%s_%d' % (name, i), (0.30, 0.20, 0.025), (x + 0.01 * (i % 2), y, z + i * 0.027),
            mat=flat(['#DDB57E', '#D3A96E'][i % 2], 0.9), bevel=0.006)


NOTE_S1 = ('Stage-1 food stall 「눈꽃 노점」 (v4.2.0.2): no awning, a blank wooden signboard on two back posts (top '
           'edge 2.6 m, the GAME writes the name into signQuad), a 0.6 m counter, a 12 cm plank step behind it. '
           'Draw market_s1_back (depth d), the clerk standing at staffPoints[0] lifted by stepLiftPx (d + 0.5), '
           'then market_s1_front (d + 1, same frame + anchor: only the counter and what stands on it). Goods-free: '
           'the real stock is the shelf pad\'s item tower.')


@market('market_s1', fp=(3.0, 1.3), notes=NOTE_S1)
def b_market_s1():
    post = flat('wood_mid', 0.8)
    dark = flat('wood_dark', 0.8)
    trim = flat('#7A4A2A', 0.8)
    # ---------------------------------------------------------------- back layer
    # plank step the clerk stands on (the front edge hides under the counter's back)
    plank_top('step', (2.46, 0.86, STEP_H), (0.0, 0.33, 0.0), c1='#B98450', c2='#A6733F')
    box('step_riser', (2.48, 0.05, STEP_H - 0.02), (0.0, -0.08, 0.0), mat=dark, bevel=0.012)
    # two back posts carrying the signboard
    PY = 1.02
    for sx in (-1, 1):
        cyl('post', 0.08, SIGN_TOP + 0.12, (sx * 1.36, PY, 0.0), mat=post, segs=14)
        PA.snow_cap('post_snow', 0.1, (sx * 1.36, PY, SIGN_TOP + 0.12), h=0.06, seed=3 + sx)
        box('post_foot', (0.24, 0.24, 0.08), (sx * 1.36, PY, 0.0), mat=dark, bevel=0.02)
    # signboard: a blank cream plank face in a dark frame, facing -Y (the name is drawn by the game)
    SW, SH, SB = 2.56, 0.50, SIGN_TOP - 0.50
    box('sign_back', (SW + 0.04, 0.06, SH + 0.04), (0.0, PY + 0.035, SB - 0.02), mat=dark, bevel=0.012)
    box('sign_face', (SW, 0.05, SH), (0.0, PY - 0.015, SB), mat=tonal('#EEDDB8', 0.04, 2.0), bevel=0.008)
    for z in (SB - 0.03, SIGN_TOP - 0.03):
        box('sign_rail', (SW + 0.14, 0.09, 0.07), (0.0, PY - 0.03, z), mat=trim, bevel=0.015)
    for sx in (-1, 1):
        box('sign_stile', (0.07, 0.09, SH + 0.1), (sx * (SW / 2 + 0.035), PY - 0.03, SB - 0.03), mat=trim,
            bevel=0.015)
    L.snow_slab('sign_snow', SW + 0.12, 0.13, 0.07, (0.0, PY - 0.03, SIGN_TOP + 0.04), seed=7, droop=0.02)
    # snowflake rosettes at the two ends of the board (decor, painted on the frame, not text)
    for sx in (-1, 1):
        cyl('rosette', 0.075, 0.025, (sx * (SW / 2 - 0.12), PY - 0.05, SB + SH / 2), rot=(90, 0, 0),
            mat=flat('#FFFFFF', 0.5), segs=24, origin='center', cap_mat=flat('#DDEBF7', 0.5))
    # back shelf between the posts: two boards, cloths, an EMPTY basket, paper bags, a spoon crock (no food painted)
    shelf = flat('#9A6436', 0.8)
    for sx in (-1, 1):
        box('shelf_side', (0.06, 0.32, 1.18), (sx * 1.14, PY - 0.06, 0.0), mat=shelf, bevel=0.012)
    for z in (0.50, 1.02):
        box('shelf_board', (2.28, 0.32, 0.045), (0.0, PY - 0.06, z), mat=shelf, bevel=0.012)
    box('shelf_back', (2.28, 0.03, 1.15), (0.0, PY + 0.09, 0.02), mat=L.stripes('#B07C48', '#9E6C3C', 8.0, 'X',
                                                                                soft=0.03), bevel=0.0)
    # ((v4.2.0.2 fix STALL-P4) the golden straw baskets read as bread at phone zoom: folded cloths, one EMPTY wicker
    #  basket with a dark inside, and a crock of wooden spoons)
    cloths('cloth', (-0.78, PY - 0.06, 0.545), n=3)
    basket('bask_b', (0.70, PY - 0.06, 0.545), r=0.14, h=0.13)
    paper_bags('bags', (-0.05, PY - 0.06, 0.545), n=4)
    crock('crock', (-0.30, PY - 0.06, 1.065))
    PA.crate_model('crate_top', 0.3, (0.55, PY - 0.06, 1.065), seed=6, snow=False)
    # lantern on the left post (night glow) + barrel with snow at the back right (as on the old stall)
    PA.lantern('lan', (-1.36, PY - 0.2, 1.62), 0.15, 3.0)
    box('lan_arm', (0.04, 0.24, 0.04), (-1.36, PY - 0.1, 1.86), mat=dark, bevel=0.01)
    PA.barrel_model('barrel', loc=(1.82, 0.72, 0), scale=0.75, seed=4)
    LA.snow_drift('d1', 0.26, (-1.62, 1.22, 0.0), seed=3)
    LA.snow_drift('d2', 0.2, (1.55, 1.25, 0.0), seed=5)
    # ---------------------------------------------------------------- front layer (the counter)
    with L.Collect() as front:
        CY = -0.32                      # counter centre (front face y = -0.55, back face y = -0.09)
        CW, CD = 2.5, 0.46
        body = L.stripes('#C98F55', '#B27843', 10.0 / CW * 2.5, 'X', soft=0.03)
        box('counter', (CW, CD, COUNTER_H - 0.07), (0.0, CY, 0.0), mat=body, bevel=0.03)
        n = 9
        for i in range(n):
            x = -CW / 2 + (i + 0.5) * CW / n
            box('cplank', (CW / n - 0.02, 0.05, COUNTER_H - 0.16), (x, CY - CD / 2 - 0.005, 0.03),
                mat=flat(['wood_light', 'plank', 'wood_mid'][i % 3], 0.8), bevel=0.015)
        box('ckick', (CW + 0.04, 0.07, 0.10), (0.0, CY - CD / 2 - 0.03, 0.0), mat=trim, bevel=0.02)
        box('ctop', (CW + 0.16, CD + 0.14, 0.07), (0.0, CY - 0.02, COUNTER_H - 0.07), mat=tonal('#E2B47A', 0.08, 2.0),
            bevel=0.03)
        for sx in (-1, 1):
            box('cleg', (0.12, 0.12, COUNTER_H - 0.07), (sx * (CW / 2 - 0.02), CY - CD / 2 + 0.03, 0.0), mat=trim,
                bevel=0.02)
        # on the counter, away from the clerk: an empty tray at the left end, a brass hand bell at the right end
        box('tray', (0.5, 0.34, 0.04), (-0.92, CY - 0.02, COUNTER_H), mat=flat('#9C6A3F', 0.8), bevel=0.02)
        box('tray_lip', (0.52, 0.36, 0.02), (-0.92, CY - 0.02, COUNTER_H + 0.03), mat=flat('#B07C48', 0.8),
            bevel=0.008)
        brass = flat('#D9A93C', 0.3, 0.75)
        cyl('bell', 0.07, 0.07, (1.02, CY - 0.04, COUNTER_H), mat=brass, segs=20, r_top=0.035, bevel=0.01)
        cyl('bell_knob', 0.016, 0.05, (1.02, CY - 0.04, COUNTER_H + 0.07), mat=brass, segs=10)
        cyl('bell_base', 0.09, 0.015, (1.02, CY - 0.04, COUNTER_H), mat=flat('#7A4A2A', 0.8), segs=20)
        LA.snow_drift('d3', 0.18, (-1.42, -0.62, 0.0), seed=8)
    # ---------------------------------------------------------------- markers
    clerk = (0.18, 0.46, 0.0)
    BA.mark('staff', clerk, facing=(0, -1, 0))
    BA.mark('customer', (-0.75, -1.45, 0.0), facing=(0, 1, 0))
    fy = PY - 0.042                     # sign face plane
    for (x, z) in ((-SW / 2 + 0.17, SIGN_TOP - 0.035), (SW / 2 - 0.17, SIGN_TOP - 0.035),
                   (SW / 2 - 0.17, SB + 0.005), (-SW / 2 + 0.17, SB + 0.005)):
        BA.mark('sign', (x, fy, z))
    BA.mark('step', (clerk[0], clerk[1], STEP_H))
    L.point_light('stalllamp', (-1.3, PY - 0.3, 1.5), 'glow', 6.0, 0.2)
    return {'front': front.objs, 'frames': [('market_s1_back', None)],
            'sprites': {'market_s1_back': {'frame': 'market_s1_back'}},
            'fx': {'register': (1.02, -0.36, 0.75), 'sign': (0.0, PY - 0.05, SB + SH / 2)}}


# ================================================================================================ (v4.3) stages 2 and 3
# 「마을 새 단장」 (docs/기획서_마을새단장.md §4, engineering_plan.md §4.2 / §9): the first shop grows sideways.  One straight
# counter row, the 자재 창구 (materials counter) at the WEST end (-X: toward the forest / mine road), the food counter(s) to
# the east; lines stand side by side in front (-Y).  Same look family as stage 1 (no awning, a blank signboard on back posts
# whose name the GAME writes, a 0.6 m counter, a 12 cm plank step, an adult clerk ON the step), plus a blank name plate
# hanging under the signboard over EACH counter (stage 2: 이름표 자재 / 먹거리; stage 3: the sign of each line 자재 / 생선 /
# 빵·고기) - the game writes the word and draws the item icon on it (markers plate0..plateN, west -> east).
# Each counter is 2.0 m; its clerk stands 0.18 m right of its centre on the step, its first customer diagonally front-left
# (the stage-1 offsets), so the front customer never stands between the camera and the clerk (gate G6: >= 75 % visible).
# The racks (the stock towers) are the game's shelf pads 1.1 m beyond each end of the row: nothing is painted there.
# Goods-free (4.2.0.1 ghost sweep rule): no fish / bread / meat / planks / ingots painted anywhere.
CW2 = 2.0               # one counter (m)
ROW_SIGN_TOP = 2.95     # the row's signboard sits higher than the stall's (2.6): the counters' plates hang under it
ROW_CUST_Y = -1.99      # the first customer of each line: 1.45 m in front of the counter and 1.1 m left of its clerk (the
ROW_CUST_DX = -0.92     #  stall's -0.75 / -1.45 put the NEXT line's front bubble over this clerk's apron: the lines are
                        #  only 2 m apart; measured in tools/test/clerk_view.mjs, gate G6 >= 75 %)


def _counter_block(name, x0, x1, trim):
    """One counter section [x0, x1] (the front layer): planked body, kick board, top, legs (stage-1 proportions)."""
    CY, CD = -0.32, 0.46
    cw, cx = x1 - x0, (x0 + x1) / 2
    body = L.stripes('#C98F55', '#B27843', 10.0 / 2.5 * cw, 'X', soft=0.03)
    box(name, (cw, CD, COUNTER_H - 0.07), (cx, CY, 0.0), mat=body, bevel=0.03)
    n = max(5, int(round(cw / 2.5 * 9)))
    for i in range(n):
        x = x0 + (i + 0.5) * cw / n
        box(name + '_pl', (cw / n - 0.02, 0.05, COUNTER_H - 0.16), (x, CY - CD / 2 - 0.005, 0.03),
            mat=flat(['wood_light', 'plank', 'wood_mid'][i % 3], 0.8), bevel=0.015)
    box(name + '_kick', (cw + 0.02, 0.07, 0.10), (cx, CY - CD / 2 - 0.03, 0.0), mat=trim, bevel=0.02)
    box(name + '_top', (cw + 0.06, CD + 0.14, 0.07), (cx, CY - 0.02, COUNTER_H - 0.07), mat=tonal('#E2B47A', 0.08, 2.0),
        bevel=0.03)


def _row(stage, kinds, notes):
    """Build a stage row: kinds = counter names west -> east (mat / food / fish / breadmeat)."""
    post = flat('wood_mid', 0.8)
    dark = flat('wood_dark', 0.8)
    trim = flat('#7A4A2A', 0.8)
    n = len(kinds)
    W = n * CW2
    xs = [-W / 2 + i * CW2 for i in range(n + 1)]          # counter boundaries west -> east
    PY = 1.02
    # ---------------------------------------------------------------- back layer
    plank_top('step', (W - 0.04, 0.86, STEP_H), (0.0, 0.33, 0.0), c1='#B98450', c2='#A6733F')
    box('step_riser', (W - 0.02, 0.05, STEP_H - 0.02), (0.0, -0.08, 0.0), mat=dark, bevel=0.012)
    PX = [xs[0] - 0.12] + xs[1:-1] + [xs[-1] + 0.12]       # posts: both ends + every boundary
    # the signboard: a blank cream face in a dark frame centred over the row (the game writes the stage name)
    TOP = ROW_SIGN_TOP
    SW, SH, SB = min(W - 0.4, 2.56 + 0.55 * n), 0.52, TOP - 0.52
    for i, px_ in enumerate(PX):
        # (the inner posts end under the signboard: it hangs in front of them, nothing sticks through its face)
        inner = abs(px_) < SW / 2 + 0.1
        top = SB - 0.05 if inner else TOP + 0.12
        cyl('post', 0.08, top, (px_, PY, 0.0), mat=post, segs=14)
        if not inner:
            PA.snow_cap('post_snow', 0.1, (px_, PY, top), h=0.06, seed=3 + i)
        box('post_foot', (0.24, 0.24, 0.08), (px_, PY, 0.0), mat=dark, bevel=0.02)
    box('sign_back', (SW + 0.04, 0.06, SH + 0.04), (0.0, PY + 0.035, SB - 0.02), mat=dark, bevel=0.012)
    box('sign_face', (SW, 0.05, SH), (0.0, PY - 0.015, SB), mat=tonal('#EEDDB8', 0.04, 2.0), bevel=0.008)
    # a long rail across all the posts (the board and the plates hang from it)
    for z in (SB - 0.03, TOP - 0.03):
        box('sign_rail', (SW + 0.14, 0.09, 0.07), (0.0, PY - 0.03, z), mat=trim, bevel=0.015)
    for sx in (-1, 1):
        box('sign_stile', (0.07, 0.09, SH + 0.1), (sx * (SW / 2 + 0.035), PY - 0.03, SB - 0.03), mat=trim,
            bevel=0.015)
        cyl('rosette', 0.075, 0.025, (sx * (SW / 2 - 0.12), PY - 0.05, SB + SH / 2), rot=(90, 0, 0),
            mat=flat('#FFFFFF', 0.5), segs=24, origin='center', cap_mat=flat('#DDEBF7', 0.5))
    L.snow_slab('sign_snow', SW + 0.12, 0.13, 0.07, (0.0, PY - 0.03, TOP + 0.04), seed=7, droop=0.02)
    # a cross rail between the posts at the plates' height (they hang from it)
    box('plate_rail', (PX[-1] - PX[0], 0.06, 0.06), (0.0, PY + 0.04, 2.1), mat=trim, bevel=0.012)
    # one hanging plate per counter (blank: the game writes 자재 / 먹거리 / 생선 / 빵·고기 and draws the item icon)
    PW, PH, PZ = 1.66, 0.44, 1.6                            # plate face: 1.66 x 0.44 m, bottom at 1.6 m (over the clerk's cap)
    plates = []
    for i in range(n):
        cx = (xs[i] + xs[i + 1]) / 2
        for sx in (-1, 1):
            cyl('plate_cord', 0.008, 2.1 - PZ - PH, (cx + sx * (PW / 2 - 0.12), PY - 0.02, PZ + PH), mat=dark, segs=6)
        box('plate_back', (PW + 0.05, 0.05, PH + 0.05), (cx, PY + 0.02, PZ - 0.025), mat=trim, bevel=0.012)
        box('plate_face', (PW, 0.04, PH), (cx, PY - 0.015, PZ), mat=tonal('#F3E6C6', 0.03, 2.0), bevel=0.006)
        plates.append((cx, PY - 0.037, PZ, PW, PH))
    # back shelves, one per counter, goods-free props that say what the counter is
    shelf = flat('#9A6436', 0.8)
    for i, kind in enumerate(kinds):
        a, b = xs[i] + 0.12, xs[i + 1] - 0.12
        cx, w = (a + b) / 2, b - a
        for sx in (a, b):
            box('shelf_side', (0.06, 0.32, 1.18), (sx, PY - 0.06, 0.0), mat=shelf, bevel=0.012)
        for z in (0.50, 1.02):
            box('shelf_board', (w, 0.32, 0.045), (cx, PY - 0.06, z), mat=shelf, bevel=0.012)
        box('shelf_back', (w, 0.03, 1.15), (cx, PY + 0.09, 0.02), mat=L.stripes('#B07C48', '#9E6C3C', 7.0, 'X',
                                                                                    soft=0.03), bevel=0.0)
        if kind == 'mat':
            # the materials counter: a coil of rope, a tool crate, a lantern, a ledger on the top shelf (no planks)
            PA.crate_model('mat_crate', 0.34, (cx - 0.45, PY - 0.06, 0.545), seed=11 + i, snow=False)
            rope = flat('#C8A877', 0.9)
            for k in range(3):
                cyl('rope_%d' % k, 0.15 - k * 0.012, 0.035, (cx + 0.35, PY - 0.06, 0.545 + k * 0.036), mat=rope,
                    segs=18, bevel=0.012)
            box('ledger', (0.26, 0.2, 0.05), (cx - 0.1, PY - 0.06, 1.065), mat=flat('#7C3F2E', 0.7), bevel=0.01)
            box('ledger_pg', (0.24, 0.18, 0.012), (cx - 0.1, PY - 0.06, 1.115), mat=flat('#F2E8D2', 0.9), bevel=0.003)
            crock('crock_m', (cx + 0.4, PY - 0.06, 1.065))
        else:
            cloths('cloth_%d' % i, (cx - 0.5, PY - 0.06, 0.545), n=3)
            paper_bags('bags_%d' % i, (cx + 0.15, PY - 0.06, 0.545), n=3 + i % 2)
            if i % 2 == 0:
                basket('bask_%d' % i, (cx + 0.55, PY - 0.06, 0.545), r=0.13, h=0.12)
                crock('crock_%d' % i, (cx - 0.25, PY - 0.06, 1.065))
            else:
                PA.crate_model('crate_%d' % i, 0.3, (cx + 0.3, PY - 0.06, 1.065), seed=6 + i, snow=False)
                basket('bask_%d' % i, (cx - 0.35, PY - 0.06, 1.065), r=0.12, h=0.11)
    PA.lantern('lan', (PX[0], PY - 0.2, 1.62), 0.15, 3.0)
    box('lan_arm', (0.04, 0.24, 0.04), (PX[0], PY - 0.1, 1.86), mat=dark, bevel=0.01)
    PA.lantern('lan2', (PX[-1], PY - 0.2, 1.62), 0.15, 3.0)
    box('lan_arm2', (0.04, 0.24, 0.04), (PX[-1], PY - 0.1, 1.86), mat=dark, bevel=0.01)
    PA.barrel_model('barrel', loc=(xs[-1] + 0.5, 0.78, 0), scale=0.75, seed=4)
    PA.barrel_model('barrel_w', loc=(xs[0] - 0.45, 0.82, 0), scale=0.7, seed=9)
    LA.snow_drift('d1', 0.26, (xs[0] - 0.3, 1.24, 0.0), seed=3)
    LA.snow_drift('d2', 0.2, (xs[-1] + 0.25, 1.28, 0.0), seed=5)
    # ---------------------------------------------------------------- front layer (the counters)
    with L.Collect() as front:
        for i in range(n):
            _counter_block('counter_%d' % i, xs[i] + (0.0 if i == 0 else 0.01), xs[i + 1] - (0.0 if i == n - 1 else 0.01),
                           trim)
        CY, CD = -0.32, 0.46
        for i, x in enumerate(xs):
            box('cleg', (0.12, 0.12, COUNTER_H - 0.07), (x + (0.02 if i == 0 else -0.02 if i == n else 0.0),
                                                         CY - CD / 2 + 0.03, 0.0), mat=trim, bevel=0.02)
        # on each counter, at its RIGHT end (away from the line, which stands front-left): a brass bell or an empty tray
        brass = flat('#D9A93C', 0.3, 0.75)
        for i in range(n):
            bx = xs[i + 1] - 0.3
            if kinds[i] == 'mat':
                box('scale_base', (0.3, 0.2, 0.04), (bx - 0.05, CY - 0.04, COUNTER_H), mat=flat('#7A4A2A', 0.8), bevel=0.01)
                cyl('scale_post', 0.015, 0.22, (bx - 0.05, CY - 0.04, COUNTER_H + 0.04), mat=brass, segs=10)
                box('scale_arm', (0.34, 0.02, 0.02), (bx - 0.05, CY - 0.04, COUNTER_H + 0.25), mat=brass, bevel=0.004)
                for sx in (-1, 1):
                    cyl('scale_pan', 0.06, 0.012, (bx - 0.05 + sx * 0.16, CY - 0.04, COUNTER_H + 0.14), mat=brass, segs=16)
            else:
                cyl('bell_%d' % i, 0.07, 0.07, (bx, CY - 0.04, COUNTER_H), mat=brass, segs=20, r_top=0.035, bevel=0.01)
                cyl('bell_knob_%d' % i, 0.016, 0.05, (bx, CY - 0.04, COUNTER_H + 0.07), mat=brass, segs=10)
                cyl('bell_base_%d' % i, 0.09, 0.015, (bx, CY - 0.04, COUNTER_H), mat=flat('#7A4A2A', 0.8), segs=20)
        LA.snow_drift('d3', 0.18, (xs[0] - 0.2, -0.62, 0.0), seed=8)
        LA.snow_drift('d4', 0.16, (xs[-1] + 0.15, -0.6, 0.0), seed=12)
    # ---------------------------------------------------------------- markers (west -> east)
    for i in range(n):
        cx = (xs[i] + xs[i + 1]) / 2
        BA.mark('staff', (cx + 0.18, 0.46, 0.0), facing=(0, -1, 0))
    for i in range(n):
        cx = (xs[i] + xs[i + 1]) / 2
        BA.mark('customer', (cx + ROW_CUST_DX, ROW_CUST_Y, 0.0), facing=(0, 1, 0))
    fy = PY - 0.042
    for (x, z) in ((-SW / 2 + 0.17, TOP - 0.035), (SW / 2 - 0.17, TOP - 0.035),
                   (SW / 2 - 0.17, SB + 0.005), (-SW / 2 + 0.17, SB + 0.005)):
        BA.mark('sign', (x, fy, z))
    for i, (cx, py, pz, pw, ph) in enumerate(plates):
        for (x, z) in ((cx - pw / 2 + 0.04, pz + ph - 0.03), (cx + pw / 2 - 0.04, pz + ph - 0.03),
                       (cx + pw / 2 - 0.04, pz + 0.03), (cx - pw / 2 + 0.04, pz + 0.03)):
            BA.mark('plate%d' % i, (x, py, z))
    cx0 = (xs[0] + xs[1]) / 2
    BA.mark('step', (cx0 + 0.18, 0.46, STEP_H))
    for i in range(n):
        BA.mark('register', ((xs[i] + xs[i + 1]) / 2 + 0.18, -1.25, 0.0))
    L.point_light('stalllamp', (PX[0] + 0.1, PY - 0.3, 1.5), 'glow', 6.0, 0.2)
    L.point_light('stalllamp2', (PX[-1] - 0.1, PY - 0.3, 1.5), 'glow', 6.0, 0.2)
    key = 'market_s%d' % stage
    return {'front': front.objs, 'frames': [(key + '_back', None)], 'sprites': {key + '_back': {'frame': key + '_back'}},
            'fx': {'sign': (0.0, PY - 0.05, SB + SH / 2)}}


NOTE_S2 = ('Stage-2 shop 「눈꽃 가게」 (v4.3): two 2 m counters in one row - the 자재 창구 (materials) at the WEST end, the '
           'food counter east of it - a blank signboard (the game writes the name) and a blank name plate over each counter '
           '(plates[k]: the game writes 자재 / 먹거리 and draws the item icon). staffPoints / customerPoints / registerPoints '
           'west -> east, one per counter. Back (depth d) -> clerks on the step (d + 0.5) -> front = the counters (d + 1). '
           'Goods-free: the stock towers are the game\'s shelf pads 1.1 m beyond each end of the row.')
NOTE_S3 = ('Stage-3 market 「눈꽃 시장」 (v4.3): three 2 m counters in one row - 자재 (WEST end) · 생선 · 빵·고기 - a blank '
           'signboard and a blank plate over each counter (the sign of each line). Same layers, points and rules as stage 2.')


@market('market_s2', fp=(4.4, 1.6), notes=NOTE_S2)
def b_market_s2():
    return _row(2, ['mat', 'food'], NOTE_S2)


@market('market_s3', fp=(6.4, 1.6), notes=NOTE_S3)
def b_market_s3():
    return _row(3, ['mat', 'fish', 'breadmeat'], NOTE_S3)


# ------------------------------------------------------------------------------------------------ (v4.3) the old sled
# The trade post is gone (merged into the 자재 창구): its merchants' sled stays parked on the plaza as decor - the same
# sled as prop_assets.b_trade_post (runners, deck, crates, sacks, chest, rolled rug) WITHOUT the canopy, the coin sign
# and the lantern, so it no longer reads as a place to sell.  A plain prop: packed onto the market_s2 page.
PROPS = OrderedDict()


def market_prop(key, fp, samples=48, catcher=10.0, notes=''):
    def deco(fn):
        PROPS[key] = dict(key=key, fn=fn, kind='prop', atlas='market_s2', fp=fp, yaw=0.0, shadow=True, samples=samples,
                          notes=notes, front='-Y', catcher=catcher, work=0, fps=8, item=None, sprites=None, extra={})
        return fn
    return deco


@market_prop('market_sled', fp=(2.9, 1.6), notes='The old trade post\'s merchant sled without its canopy (v4.3 decor: '
                                               'the trade post is the shop\'s 자재 창구 now). Front faces screen down-left '
                                               '(world -Y); runners curl up at +X.')
def b_market_sled():
    iron = flat('#5C4430', 0.7)
    for sy_ in (-1, 1):
        y = sy_ * 0.62
        L.smooth_tube('runner', [(-1.4, y, 0.07), (0.6, y, 0.07), (1.25, y, 0.1), (1.5, y, 0.32), (1.4, y, 0.55)],
                      0.055, iron)
        for x in (-1.0, -0.2, 0.6):
            box('strut', (0.1, 0.1, 0.25), (x, y, 0.07), mat=flat('wood_dark', 0.8), bevel=0.02)
    deck = L.stripes('#C98F55', '#B27843', 3.3, 'X', rough=0.8, soft=0.03)
    box('deck', (2.7, 1.45, 0.16), (0, 0, 0.3), mat=deck, bevel=0.04)
    for sy_ in (-1, 1):
        box('rail', (2.7, 0.08, 0.14), (0, sy_ * 0.7, 0.46), mat=flat('wood_dark', 0.8), bevel=0.03)
    z = 0.46
    PA.crate_model('c1', 0.62, (-0.85, 0.25, z), seed=1)
    PA.crate_model('c2', 0.52, (-0.85, 0.28, z + 0.62), rot=(0, 0, 12), seed=2)
    PA.crate_model('c3', 0.55, (-0.2, 0.35, z), rot=(0, 0, -8), seed=3)
    PA.barrel_model('br', loc=(0.5, 0.3, z), scale=0.8, seed=5)
    sack = flat('#D8C39A', 0.9)
    for i, (x, y) in enumerate([(-0.3, -0.35), (0.25, -0.3)]):
        blob('sack', 0.3, (x, y, z + 0.2), sack, scale=(1.0, 0.85, 0.85), seed=400 + i, amp=0.15, subdiv=3,
             flat_bottom=0.6)
        cyl('tie', 0.07, 0.12, (x, y, z + 0.42), mat=flat('rope', 0.8), segs=10, r_top=0.05)
    rolled = flat('#3D7CC9', 0.8)
    cyl('rug', 0.13, 0.9, (1.0, 0.35, z + 0.13), rot=(0, 90, 0), mat=rolled, segs=18, origin='center',
        cap_mat=flat('#2F64A6', 0.8))
    LA.snow_drift('sd1', 0.22, (-1.5, 0.5, 0.0), seed=21)
    LA.snow_drift('sd2', 0.18, (1.2, -0.85, 0.0), seed=22)
    return {'frames': [('market_sled', None)], 'sprites': {'market_sled': {'frame': 'market_sled'}}}
