"""
gen_roads.py - CONTRACT_V5 §N road kit for Frost Village: seamless road textures + iso-aligned edge / marking
decals, procedurally (numpy + Pillow, deterministic).  Imports fxlib.py, gen_ground.py, check_assets.py and
pack_utils.py READ-ONLY; writes only assets/roads/, docs/previews/roads_*.png and tools/fx/_cache/roads/.

Re-run (from anywhere; ~2-4 min on a busy CPU):
    python3 frost-village/tools/fx/gen_roads.py                 # everything (assets + manifest + previews)
    python3 frost-village/tools/fx/gen_roads.py --only road_dirt,curb_x   # scratch sheet -> tools/fx/_cache/roads/
    python3 frost-village/tools/fx/gen_roads.py --no-scene      # skip docs/previews/roads_scene.png
Check:  python3 frost-village/tools/fx/check_roads.py

============================================================================ THE ROAD GRID (read this first)
Projection (CONTRACT §1, src/core/Iso.js): +1 m world X = screen (+45.25, +22.63) px, +1 m world Y = (+45.25, -22.63).
Roads live on a global grid of CELLS of sqrt(2) m = 1.4142 m, because one cell is an exact integer pixel step:
    one cell along world X = (+64, +32) px          one cell along world Y = (+64, -32) px
    a 1x1-cell ground square = the classic 128x64 px iso diamond.
Pick ONE integer grid origin G (screen px, e.g. (0, 0) of the world).  Lattice point (i, j) = G + i*(64,32) + j*(64,-32).
Cell (i, j) = the diamond whose min corner (smallest i, j) is lattice point (i, j).
In screen terms, with (x, y) measured from G:   a = x + 2y,  b = x - 2y   (128 units per cell, 90.51 per metre);
    cell i = floor(a / 128), cell j = floor(b / 128); world X = a / 90.51 m, world Y = b / 90.51 m.

Widths (metres, all integer cells):
    lane            2 cells = 2.83 m            (one direction of traffic; vehicles <= 2.2 m wide)
    carriageway     2 lanes = 4 cells = 5.66 m  (a 1-lane village track = 2 cells)
    sidewalk        1 cell  = 1.41 m            (city class only; on both sides)
    full city street = 1 + 4 + 1 = 6 cells = 8.49 m
  * carriageway edges (and the centre line between the lanes) lie on EVEN grid lines (i or j even); a lane's centre
    lies on an odd grid line.  This keeps the wheel ruts of road_dirt* inside their lanes.

Textures (assets/roads/*.png 512x512, seamless in x and y, draw at scale 1, NEVER scaled):
    road_dirt (ruts along world X), road_dirt_y (ruts along Y), road_dirt_cross (both; junction squares),
    road_cobble_wide, road_asphalt, sidewalk.
  Fill with a repeating pattern whose origin is G (Canvas2D: ctx.createPattern(img,'repeat') in a context that maps
  world px; pattern.setTransform(new DOMMatrix().translate(G.x, G.y)); Phaser TileSprite: tilePosition = (x0-G.x, y0-G.y)
  for a sprite whose top-left is (x0, y0)).  Inside every texture the cell lines are a = 0 (mod 128), b = 0 (mod 128)
  measured from the texture's top-left pixel CORNER, so slabs / setts / ruts line up with the grid and with each other.

Layer order (all baked into the ground canvas, below every depth-sorted sprite):
    1 ground_snow  2 carriageway + sidewalk textures (per cell, see cell types)  3 snow edges (snow_edge_*, snow_corner_*,
    snow_inner_*)  4 curbs (curb_*, curb_corner_*, curb_inner_* or the `intersection` composite)
    5 markings (lane_*, crosswalk_*, stall_lines*)  -> then vehicles / people / buildings (normal depth sort).

Cell types: every grid cell is NONE (snow), ROAD (carriageway; texture by class + direction) or WALK (sidewalk).
  * Fill each texture's cells as ONE path (union of cell diamonds) so no hair-line seams appear between cells.
  * EXCEPTION: a WALK cell that is a convex sidewalk corner (it has ROAD on two orthogonal sides and diagonally between
    them, e.g. the four corner squares of a junction) is filled with the CARRIAGEWAY texture: its curb_corner_* piece
    paints the paving itself and leaves the rounded-off corner showing the carriageway.
  * Dirt class: ROAD cells of a road running along X use road_dirt, along Y road_dirt_y, junction / bend squares
    road_dirt_cross.  Other classes use one texture for all ROAD cells.

Pieces (atlas roads_decals; frames are UNTRIMMED; anchor = integer pixel; draw frame top-left at anchor - anchorPx):
  Straight edge pieces are exactly 1 cell long and join seamlessly (each owns exactly the pixels whose centre lies in its
  cell slice: |a - a_anchor| < 64 for *_x, |b - b_anchor| < 64 for *_y).  Anchor = midpoint of the cell edge segment
  (= lattice point + (32, 16) for *_x, + (32, -16) for *_y).  Step to the next piece: (64, 32) / (64, -32).
    curb_x       curb on the +Y edge of a road along X (screen-upper edge; its face is visible)   walk at +Y, road at -Y
    curb_x_near  curb on the -Y edge (screen-lower edge; top only)                                walk at -Y, road at +Y
    curb_y       curb on the -X edge of a road along Y (screen-upper-left edge; face visible)     walk at -X, road at +X
    curb_y_near  curb on the +X edge (screen-lower-right; top only)                                walk at +X, road at -X
    snow_edge_x / _x_near / _y / _y_near   soft snow bank between paved cells and NONE cells, same side rules
                 (snow takes the place of the walk).  3 variants each: <key>, <key>_1, <key>_2 - pick
                 variant = ((i * 7 + j * 13) % 3 + 3) % 3 for the segment that starts at lattice point (i, j).
  Corner pieces sit on a lattice point P and own the first cell of each of their two edges (straight pieces start one
  cell away).  The suffix n/e/s/w names the screen direction of the piece's quarter Q around P
  (e = +X+Y, s = +X-Y, w = -X-Y, n = -X+Y):
    curb_corner_<q>  the cell in Q is WALK, the other three ROAD     (rounded convex sidewalk corner, r = 1.0 m)
    curb_inner_<q>   the cell in Q is ROAD, the other three WALK     (outside of a bend; rounds the road corner)
    snow_corner_<q>  the cell in Q is NONE, the other three paved    (corner of a snowy block)
    snow_inner_<q>   the cell in Q is paved, the other three NONE    (outside of a bend / road end)
  Markings (flat paint, symmetric, draw after curbs):
    lane_x / lane_y            yellow dashed centre line, 2 cells long (dash 1.6 m), anchor = centre of the 2-cell span on
                               the carriageway centre line; step (128, 64) / (128, -64)
    crosswalk_x / crosswalk_y  zebra module, 1x1 cell (2 stripes), anchor = cell centre (lattice point + (64, 0)); one per
                               carriageway cell across the road: crosswalk_x on a road along X (people cross along Y)
    stall_lines / stall_lines_y   one parking stall, 2 cells wide x 3 cells long (lines inside, open end toward -X / -Y;
                               flip X+Y for the other way); anchor = stall centre; neighbours share side lines
    intersection               convenience composite of the 4 curb_corner_* pieces of a standard 4-way junction
                               (carriageway 4 + sidewalks 1+1 cells), anchor = junction centre.
The same algorithm, implemented in compose() below, draws docs/previews/roads_scene.png.
"""
import argparse
import json
import math
import os
import sys

import numpy as np
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.dirname(HERE))
import fxlib as F                                      # noqa: E402
from fxlib import hexc                                 # noqa: E402
import gen_ground as GG                                # noqa: E402  (read-only reuse: coords, relief, sample, finish)
import pack_utils                                      # noqa: E402

OUT = os.path.join(ROOT, 'assets', 'roads')
PREV = os.path.join(ROOT, 'docs', 'previews')
CACHE = os.path.join(HERE, '_cache', 'roads')
ATLAS = 'roads_decals'

N = 512
CELL = 128                       # a / b units per cell
CELL_M = math.sqrt(2.0)          # metres per cell
UPM = CELL / CELL_M              # a / b units per metre (90.51)
AXM = 64.0 / math.sqrt(2.0)      # 45.2548 px per metre along an axis (screen x)
AYM = AXM / 2.0                  # 22.6274
ZPX = 64.0 * math.cos(math.radians(30))   # 55.43 screen px per metre of height
ACROSS = 40.477                  # screen px per metre measured perpendicular to an axis-aligned line
LXY = GG.LXY                     # screen direction toward the sun (upper-left)
WHITE = hexc('#FFFFFF')
SNOW = hexc('#F4F7FB')


def lerp3(c0, c1, t):
    return F.mix(c0, c1, np.clip(t, 0, 1))


def world(dx, dy):
    """Screen offset (px) -> world metres (mx, my)."""
    return (dx / AXM + dy / AYM) * 0.5, (dx / AXM - dy / AYM) * 0.5


def screen(mx, my):
    return AXM * (mx + my), AYM * (mx - my)


# =========================================================================== periodic texture helpers
def tcoords(ss):
    X, Y = GG.coords(N, ss)
    return X, Y, X + 2.0 * Y, X - 2.0 * Y


def white(seed):
    return np.random.default_rng(seed).random((N, N)).astype(np.float32)


def at(field, xc, yc):
    """Nearest periodic lookup of a 512x512 field at screen px coords (feature centres)."""
    xi = np.mod(np.floor(xc).astype(np.int64), N)
    yi = np.mod(np.floor(yc).astype(np.int64), N)
    return field[yi, xi]


def centre_xy(ac, bc):
    return (ac + bc) * 0.5, (ac - bc) * 0.25


def tnoise(seed, scale, ss, **kw):
    """Periodic noise on the supersampled texture grid (scale in OUTPUT px)."""
    return F.fft_noise(N * ss, N * ss, seed, scale=scale * ss, **kw)


def ab_px(d_units):
    """a/b-unit distance across an axis line -> screen px."""
    return d_units / math.sqrt(5.0)


ANG_X = math.atan2(1, 2)          # screen angle of world +X (26.57 deg, down-right)
ANG_Y = -math.atan2(1, 2)         # world +Y (up-right)


# =========================================================================== textures
def tex_sidewalk():
    """Pale paving: half-cell (0.71 m) square slabs on the road grid (2x2 per cell), warm light stone with a few
    blush / cool slabs, bevelled slab edges lit from the upper-left, snow packed in the joints and a light dusting
    that gathers along the slab edges."""
    ss = 2
    X, Y, A, B = tcoords(ss)
    S = 64.0
    ia, ib = np.floor(A / S), np.floor(B / S)
    fa, fb = A - ia * S - S / 2, B - ib * S - S / 2
    xc, yc = centre_xy(ia * S + S / 2, ib * S + S / 2)
    r1, r2 = at(white(901), xc, yc), at(white(902), xc, yc)
    jw = 2.4
    d = F.sd_box(fa, fb, 0, 0, S / 2 - jw, S / 2 - jw, 7.0)          # a/b units, <0 inside the slab
    dpx = ab_px(d)
    cov = np.clip(0.5 - dpx / 0.75, 0, 1)
    hgt = np.clip(-dpx / 2.6, 0, 1)
    hgt = (1 - (1 - hgt) ** 2) * 2.4
    lit = GG.relief(F.blur(hgt, 0.5 * ss, wrap=True), ss, 0.6)
    base = lerp3(hexc('#DAD2C7'), hexc('#E8E2D8'), r1)
    base = np.where((r2 < 0.10)[..., None], lerp3(hexc('#E4CFC4'), hexc('#ECDCD2'), r1), base)   # blush slabs
    base = np.where((r2 > 0.90)[..., None], lerp3(hexc('#CDD3DB'), hexc('#DBE0E7'), r1), base)   # cool slabs
    grain = tnoise(904, 0.9, ss)
    base = lerp3(base, hexc('#C4BCB0'), np.clip(grain - 1.4, 0, 1) * 0.45)
    mott = tnoise(905, 10, ss)
    base = lerp3(base, hexc('#CEC5B8'), np.clip(mott * 0.5, 0, 1) * 0.3)
    col = lerp3(base, WHITE, np.clip(lit, 0, 1) * 0.8)
    col = lerp3(col, hexc('#958F98'), np.clip(-lit, 0, 1) * 0.6)
    # joints: packed snow, cool shade next to the slab edges
    jcol = lerp3(hexc('#C8D0DB'), hexc('#E4E9F0'), np.clip(0.5 + tnoise(906, 6, ss) * 0.4, 0, 1))
    ao = np.clip(1 - np.abs(dpx) / 1.6, 0, 1) * (dpx > 0)
    jcol = lerp3(jcol, hexc('#A3AEBF'), ao * 0.5)
    rgb = lerp3(jcol, col, cov)
    # light snow dusting: soft rims of snow along the slab edges where the drift field is high + a few clean drifts
    low = tnoise(907, 40, ss)
    det = tnoise(908, 3, ss)
    rimsnow = np.clip(1 - (-dpx) / 2.6, 0, 1) * (dpx < 0) * np.clip(low * 0.8 + 0.2 + det * 0.25, 0, 1)
    drift = np.clip((low * 0.9 + det * 0.18 - 1.25) * 1.6, 0, 1)
    drift = F.blur(drift, 1.2 * ss, wrap=True)
    rgb = lerp3(rgb, hexc('#F5F7FA'), np.clip(rimsnow * 0.75 + drift * 0.8, 0, 0.9))
    return GG.finish(rgb, ss)


def tex_cobble():
    """Wide cobble road (town era): rounded rectangular setts (0.57 x 0.40 m) in running bond, slightly jittered and
    domed, blue-grey granite mixed with warm beige and a few rosy stones, snow packed in the joints, frost on the tops
    and a few soft patches of packed snow.  Rows run along world X but it reads the same on both axes (one texture for
    every ROAD cell incl. junctions)."""
    ss = 2
    X, Y, A, B = tcoords(ss)
    SA, SB = 512.0 / 10, 512.0 / 14                          # sett pitch along a / b (wraps exactly on the torus)
    ib = np.floor(B / SB)
    off = np.mod(ib, 2) * 0.5 * SA
    ia = np.floor((A - off) / SA)
    ac, bc = ia * SA + SA / 2 + off, ib * SB + SB / 2
    xc, yc = centre_xy(ac, bc)
    w = [white(911 + k) for k in range(6)]
    r1, r2, r3 = at(w[0], xc, yc), at(w[1], xc, yc), at(w[2], xc, yc)
    ja, jb = (at(w[3], xc, yc) - 0.5) * 2.6, (at(w[4], xc, yc) - 0.5) * 2.0
    fa, fb = A - ac - ja, B - bc - jb
    ang = (r3 - 0.5) * 0.16
    ca, sa = np.cos(ang), np.sin(ang)
    ra, rb = ca * fa + sa * fb, -sa * fa + ca * fb
    d = F.sd_box(ra, rb, 0, 0, SA / 2 - 3.4 - (at(w[5], xc, yc)) * 1.6, SB / 2 - 3.2 - r1 * 1.0, 9.0)
    dpx = ab_px(d)
    cov = np.clip(0.5 - dpx / 0.7, 0, 1)
    dome = np.clip(-dpx / 5.5, 0, 1)
    hgt = (1 - (1 - dome) ** 2) * 4.2
    lit = GG.relief(F.blur(hgt, 0.5 * ss, wrap=True), ss, 0.6)
    col = lerp3(hexc('#94A0B1'), hexc('#B6BFCC'), r1)                         # blue-grey granite
    col = np.where((r2 < 0.28)[..., None], lerp3(hexc('#ACA092'), hexc('#C8BCAD'), r1), col)   # warm beige
    col = np.where((r2 > 0.95)[..., None], lerp3(hexc('#BC9488'), hexc('#CFA79A'), r1), col)   # rosy
    col = np.where(((r2 > 0.84) & (r2 <= 0.95))[..., None], lerp3(hexc('#7F889A'), hexc('#909AAA'), r1), col)
    mott = tnoise(917, 2.6, ss)
    col = lerp3(col, hexc('#737B8B'), np.clip(-mott - 0.9, 0, 1) * 0.28)
    col = lerp3(col, hexc('#F4F7FB'), np.clip(lit, 0, 1) * 0.8)
    col = lerp3(col, hexc('#4E5A72'), np.clip(-lit, 0, 1) * 0.5)
    frost = np.clip(dome - 0.6, 0, 1) * np.clip(tnoise(918, 3, ss) + 0.1, 0, 1)
    col = lerp3(col, hexc('#EEF3F9'), frost * 0.5)
    joint = lerp3(hexc('#D5DDE8'), hexc('#EBF0F6'), np.clip(0.5 + tnoise(919, 4, ss) * 0.35, 0, 1))
    ao = np.clip(1 - dpx / 2.4, 0, 1) * (dpx > 0)
    joint = lerp3(joint, hexc('#9DACC2'), ao * 0.55)
    rgb = lerp3(joint, col, cov)
    sh = F.blur(np.roll(np.roll(cov, int(1 * ss), 0), int(2 * ss), 1), 0.8 * ss, wrap=True)
    rgb = lerp3(rgb, hexc('#8FA0B9'), np.clip(sh - cov, 0, 1) * 0.4)
    # soft patches of packed snow over the setts
    low = tnoise(920, 44, ss)
    det = tnoise(921, 7, ss)
    patch = F.blur(np.clip((low + det * 0.2 - 1.6) * 1.8, 0, 1), 1.8 * ss, wrap=True)
    plit = GG.relief(F.blur(patch, 3 * ss, wrap=True) * 4.0, ss, 1.0)
    snow = lerp3(hexc('#E9EEF5'), hexc('#F6F8FC'), np.clip(0.5 + det * 0.3, 0, 1))
    snow = lerp3(snow, WHITE, np.clip(plit, 0, 1) * 0.8)
    snow = lerp3(snow, hexc('#B6C5DA'), np.clip(-plit, 0, 1) * 0.8)
    rgb = lerp3(rgb, snow, np.clip(patch * 1.1, 0, 1))
    cr = tnoise(922, 1.2, ss)
    rgb = lerp3(rgb, hexc('#F7FAFD'), np.clip((cr - 2.4) * 1.3, 0, 1) * 0.8)
    return GG.finish(rgb, ss)


def tex_asphalt():
    """City asphalt: soft blue-charcoal (toy-like, smooth rather than gritty) with a hint of aggregate, faint
    tar-sealed cracks and a light dusting of snow (powder veil + a few small soft drifts).  Non-directional."""
    ss = 2
    X, Y, A, B = tcoords(ss)
    base = np.broadcast_to(hexc('#5F6676'), X.shape + (3,)).copy()
    big = tnoise(931, 70, ss)
    mid = tnoise(932, 12, ss)
    base = lerp3(base, hexc('#565D6C'), np.clip(-big * 0.6, 0, 1) * 0.6)
    base = lerp3(base, hexc('#6A7182'), np.clip(big * 0.6, 0, 1) * 0.5)
    base = lerp3(base, hexc('#5A6271'), np.clip(mid * 0.5, 0, 1) * 0.3)
    # soft aggregate
    g = tnoise(934, 0.8, ss)
    base = lerp3(base, hexc('#757C8C'), np.clip(g - 1.7, 0, 1) * 0.35)
    base = lerp3(base, hexc('#4A505D'), np.clip(-g - 1.8, 0, 1) * 0.35)
    # faint cracks (sealed with tar)
    F1, F2, _ = GG.worley_xy(X, Y * 2.0, N, 2 * N, 5, seed=935, jitter=0.85)
    edge = (F2 - F1) * 0.5
    wig = tnoise(936, 2.0, ss) * 1.2
    crack = np.clip(1 - np.abs(edge + wig) / 1.0, 0, 1)
    crack *= np.clip(tnoise(937, 18, ss) - 0.6, 0, 1) * 1.6
    base = lerp3(base, hexc('#454B58'), np.clip(crack, 0, 1) * 0.6)
    # snow dusting: a light powder veil + a few small soft drifts with a frosted rim
    low = tnoise(938, 30, ss)
    det = tnoise(939, 5, ss)
    fine = tnoise(940, 1.2, ss)
    dfield = low * 0.85 + det * 0.35 + fine * 0.08
    drift = np.clip((dfield - 1.3) * 1.1, 0, 1)
    drift = F.blur(drift, 2.0 * ss, wrap=True)
    veil = np.clip((dfield + 0.2) * 0.45, 0, 1) * np.clip(0.6 + fine * 0.4, 0, 1) * 0.22
    dh = F.blur(drift, 1.5 * ss, wrap=True) * 2.5
    dl = GG.relief(dh, ss, 1.0)
    dcol = lerp3(hexc('#E1E7EF'), WHITE, np.clip(dl, 0, 1) * 0.9)
    dcol = lerp3(dcol, hexc('#B3C1D5'), np.clip(-dl, 0, 1) * 0.8)
    rgb = lerp3(base, hexc('#C5CEDB'), veil)
    rgb = lerp3(rgb, dcol, np.clip(drift * 0.78, 0, 0.78))
    rgb = lerp3(rgb, WHITE, np.clip(tnoise(941, 0.7, ss) - 2.8, 0, 1) * 0.6 * (1 - drift))
    return GG.finish(rgb, ss)


# --------------------------------------------------------------------------- dirt + ruts
LANE = 2 * CELL                   # 256 units: one lane
RUT_OFF = 0.75 * UPM              # wheel tracks at the lane centre +-0.75 m (1.5 m track, sleighs / carts / trucks)


def _dirt_base(ss):
    """Packed snow road base: cool grey-white packed snow, earth showing through in worn patches, a few pebbles.
    Returns (rgb, height, coords)."""
    X, Y, A, B = tcoords(ss)
    low = tnoise(951, 46, ss)
    mid = tnoise(952, 14, ss)
    det = tnoise(953, 3, ss)
    rgb = np.broadcast_to(hexc('#CCD3DE'), X.shape + (3,)).copy()
    rgb = lerp3(rgb, hexc('#BCC4D2'), np.clip(-low * 0.7, 0, 1) * 0.7)
    rgb = lerp3(rgb, hexc('#E3E9F0'), np.clip(low * 0.7, 0, 1) * 0.6)
    earth = np.clip((mid * 0.7 + low * 0.5 - 0.9) * 0.9, 0, 1)
    earth = F.blur(earth, 1.5 * ss, wrap=True)
    rgb = lerp3(rgb, hexc('#B9AEA2'), earth * 0.6)
    peb = tnoise(954, 0.9, ss)
    rgb = lerp3(rgb, hexc('#8D8378'), np.clip(peb - 2.5, 0, 1) * 0.7)
    rgb = lerp3(rgb, WHITE, np.clip(-peb - 2.3, 0, 1) * 0.7)
    hgt = mid * 0.5 + det * 0.2 + low * 0.8
    return rgb, hgt, (X, Y, A, B), earth


def _ruts(Q, ss, seed, angle):
    """Rut field for tracks running along the direction with constant Q (B for world X, A for world Y).
    Returns (groove 0..1, bank 0..1, shine, trample) on the supersampled grid."""
    meander = tnoise(seed, 90, ss) * 4.5 + tnoise(seed + 1, 30, ss) * 1.0
    inten = np.clip(0.7 + tnoise(seed + 2, 45, ss, aniso=3.0, angle=angle) * 0.3, 0.35, 1.0)
    t = np.mod(Q + meander, LANE) - LANE / 2                      # offset from the lane centre (units)
    groove = np.zeros_like(t)
    bank = np.zeros_like(t)
    for side in (-1, 1):
        wv = tnoise(seed + 3 + side, 34, ss) * 1.6
        dt = np.abs(t - side * RUT_OFF + wv)
        g = F.smoothstep(25.0, 9.0, dt)
        groove = np.maximum(groove, g)
        bank = np.maximum(bank, np.exp(-((dt - 28.0) / 7.0) ** 2))
    shine = np.clip(tnoise(seed + 6, 3, ss, aniso=8.0, angle=angle) - 0.4, 0, 1)
    trample = np.exp(-(t / 34.0) ** 2)                            # hooves / boots in the middle of the lane
    return groove * inten, bank * inten, shine * groove * inten, trample


def tex_dirt(axes):
    """road_dirt (axes='x'), road_dirt_y ('y'), road_dirt_cross ('xy'): packed snow + earth with two wheel / runner
    ruts per lane.  Lanes are 2 cells wide and their centres sit on odd grid lines (Q = 128 mod 256)."""
    ss = 2
    rgb, hgt, (X, Y, A, B), earth = _dirt_base(ss)
    sets = []
    if 'x' in axes:
        sets.append(_ruts(B, ss, 960, ANG_X))
    if 'y' in axes:
        sets.append(_ruts(A, ss, 970, ANG_Y))
    k = 0.85 if len(sets) == 2 else 1.0
    groove = np.zeros_like(hgt)
    bank = np.zeros_like(hgt)
    shine = np.zeros_like(hgt)
    trample = np.zeros_like(hgt)
    for g, r, s, tr in sets:
        groove = np.maximum(groove, g * k)
        bank = np.maximum(bank, r * k)
        shine = np.maximum(shine, s * k)
        trample = np.maximum(trample, tr)
    bank = bank * (1 - groove)
    # trampled lane middle: small dimples (hoof prints / boots), sparse
    imp = (white(980) > 0.997).astype(np.float32) * white(981)
    dimp = GG.periodic_conv(imp, GG.centred_kernel(N, lambda dx, dy: np.exp(-(dx * dx / 3.0 + dy * dy / 1.3))))
    dimp = np.clip(dimp, 0, 1)
    dimp = np.array(Image.fromarray(dimp).resize((N * ss, N * ss), Image.BILINEAR), np.float32)
    dimp = dimp * np.clip(trample * 1.3, 0, 1)
    h = hgt * 0.4 - groove * 1.4 + bank * 0.5 - dimp * 1.2
    lit = GG.relief(F.blur(h, 1.4 * ss, wrap=True), ss, 0.7)
    col = rgb
    col = lerp3(col, hexc('#C6CEDA'), np.clip(trample * 0.4, 0, 1) * 0.5)
    var = np.clip(0.5 + tnoise(986, 9, ss) * 0.35 + earth, 0, 1)
    gcol = lerp3(hexc('#BDB4AA'), hexc('#A29486'), var)
    core = F.smoothstep(0.55, 1.0, groove)
    col = lerp3(col, gcol, np.clip(groove, 0, 1) * 0.62)                     # slush + earth in the ruts
    col = lerp3(col, hexc('#958779'), core * np.clip(var, 0.3, 1) * 0.45)
    col = lerp3(col, hexc('#ECF0F6'), np.clip(bank, 0, 1) * 0.45)
    col = lerp3(col, hexc('#A99E94'), dimp * 0.55)
    col = lerp3(col, WHITE, np.clip(lit, 0, 1) * 0.55)
    col = lerp3(col, hexc('#8C9AB2'), np.clip(-lit, 0, 1) * 0.45)
    col = lerp3(col, hexc('#E4EAF2'), np.clip(shine * 1.6, 0, 1) * 0.5)              # icy polish in the ruts
    cr = tnoise(985, 1.1, ss)
    col = lerp3(col, hexc('#F8FAFD'), np.clip((cr - 2.4) * 1.3, 0, 1) * 0.8)
    return GG.finish(col, ss)


TEXTURES = {
    # key: (fn, class, axis, notes)
    'road_dirt': (lambda: tex_dirt('x'), 'dirt', 'x',
                  'Village dirt road (packed snow + earth) with 2 wheel/runner ruts per lane running along world X. '
                  'Use on ROAD cells of roads along X.'),
    'road_dirt_y': (lambda: tex_dirt('y'), 'dirt', 'y',
                    'Same as road_dirt but the ruts run along world Y. Use on ROAD cells of roads along Y.'),
    'road_dirt_cross': (lambda: tex_dirt('xy'), 'dirt', 'xy',
                        'Same base with the ruts of both directions crossing: junction / bend squares of dirt roads.'),
    'road_cobble_wide': (tex_cobble, 'town', 'any',
                         'Town-era wide cobble road: quarter-cell square setts on the grid, snow in the joints. '
                         'Non-directional (all ROAD cells incl. junctions).'),
    'road_asphalt': (tex_asphalt, 'city', 'any',
                     'City asphalt, soft blue-charcoal with a light patchy snow dusting. Non-directional.'),
    'sidewalk': (tex_sidewalk, 'city', 'any',
                 'Pale paving slabs, 2x2 per cell on the grid (WALK cells). Non-directional.'),
}


# =========================================================================== decal pieces
HC = 0.12                         # curb height (m)
WT = 0.17                         # curb top width (m)
LIFT = HC * ZPX                   # 6.65 px: screen offset of the curb top
R_CURB = 1.0                      # rounded convex sidewalk corner (m)
R_CURB_IN = 0.55                  # rounded road corner on the outside of a bend (m)
R_SNOW = 0.6                      # rounded snowy-block corner (m)
R_SNOW_IN = 0.45                  # rounded inner snow corner (m)
SIDES = {'e': (1, 1), 's': (1, -1), 'w': (-1, -1), 'n': (-1, 1)}
CURB_TOP = ('#EEF1F5', '#C9D0DA')
CURB_FACE = ('#AEB7C5', '#7E899B')
SLAB_PAL = ('#DAD2C7', '#E8E2D8')


class Frame:
    """Untrimmed piece frame: (w, h) px with the anchor at the integer pixel corner (ax, ay)."""

    def __init__(self, pts_m, pad=3, lift=0.0):
        xs, ys = [], []
        for mx, my in pts_m:
            x, y = screen(mx, my)
            xs.append(x)
            ys += [y, y - lift]
        x0, x1 = math.floor(min(xs) - pad), math.ceil(max(xs) + pad)
        y0, y1 = math.floor(min(ys) - pad), math.ceil(max(ys) + pad)
        self.w, self.h = x1 - x0 + (x1 - x0) % 2, y1 - y0 + (y1 - y0) % 2
        self.ax, self.ay = -x0, -y0

    def canvas(self, ss=4):
        c = F.Canvas(self.w, self.h, ss=ss)
        c.DX, c.DY = c.X - self.ax, c.Y - self.ay
        c.MX, c.MY = world(c.DX, c.DY)
        return c

    def centres(self):
        ys, xs = np.mgrid[0:self.h, 0:self.w].astype(np.float32)
        return xs + 0.5 - self.ax, ys + 0.5 - self.ay

    def anchor(self):
        return [round(self.ax / self.w, 5), round(self.ay / self.h, 5)]


def keep_mask(img, keep):
    a = np.array(img)
    a[~keep] = 0
    return Image.fromarray(a, 'RGBA')


def straight_frame(axis, vmin, vmax, lift=0.0, pad=3):
    h = CELL_M / 2
    pts = []
    for u in (-h, h):
        for v in (vmin, vmax):
            pts.append((u, v) if axis == 'x' else (v, u))
    return Frame(pts, pad, lift)


def straight_keep(fr, axis):
    dx, dy = fr.centres()
    q = dx + 2 * dy if axis == 'x' else dx - 2 * dy
    return (q >= -CELL / 2) & (q < CELL / 2)


def corner_frame(sx, sy, m, lift=0.0, pad=3):
    pts = [(sx * p, sy * q) for p in (-m, CELL_M) for q in (-m, CELL_M)]
    return Frame(pts, pad, lift)


def corner_keep(fr, sx, sy, m):
    dx, dy = fr.centres()
    pa, qb = sx * (dx + 2 * dy), sy * (dx - 2 * dy)
    lo = -m * UPM
    return (pa >= lo) & (pa < CELL) & (qb >= lo) & (qb < CELL)


def rquarter(p, q, r):
    """Signed distance (m, + inside) to the quarter-plane p, q >= 0 with its corner rounded by radius r."""
    arc = (p < r) & (q < r)
    return np.where(arc, r - np.hypot(p - r, q - r), np.minimum(p, q)).astype(np.float32)


def psin(x, seed, kmin=1, kmax=4, fall=0.6):
    """Periodic 1-D noise with period CELL_M (integer harmonics), ~unit amplitude."""
    r = np.random.default_rng(seed)
    out = np.zeros_like(x, dtype=np.float32)
    tot = 0.0
    for k in range(kmin, kmax + 1):
        a = r.uniform(0.5, 1.0) / k ** fall
        out += a * np.sin(2 * math.pi * k * x / CELL_M + r.uniform(0, 2 * math.pi))
        tot += a
    return out / max(tot, 1e-6)


def window(u, margin=0.24, soft=0.16):
    """1 in the middle of a 1-cell piece, 0 within `margin` of its cut lines (u = along offset from the centre)."""
    return np.clip((CELL_M / 2 - margin - np.abs(u)) / soft, 0, 1)


def grad_world(fn, mx, my, eps=0.004):
    gx = (fn(mx + eps, my) - fn(mx - eps, my)) / (2 * eps)
    gy = (fn(mx, my + eps) - fn(mx, my - eps)) / (2 * eps)
    n = np.maximum(np.hypot(gx, gy), 1e-6)
    return gx / n, gy / n


def screen_dir(nx, ny):
    """World horizontal direction -> unit screen direction."""
    sx = nx * 0.8944 + ny * 0.8944
    sy = nx * 0.4472 - ny * 0.4472
    n = np.maximum(np.hypot(sx, sy), 1e-6)
    return sx / n, sy / n


def screen_relief(c, h_px, k=1.0):
    """Sun light on a height field drawn on the canvas grid (h in screen px of height)."""
    gy, gx = np.gradient(h_px, c.px)
    return -(gx * LXY[0] + gy * LXY[1]) * k


def blob_field(c, centres, r_m, sq=1.0):
    """Union SDF (metres) of small round blobs at world positions (lists of (mx, my, r))."""
    d = np.full(c.MX.shape, 9.0, np.float32)
    for mx, my, r in centres:
        d = np.minimum(d, np.hypot(c.MX - mx, (c.MY - my) * sq) - r * r_m)
    return d


# --------------------------------------------------------------------------- paving (corner pieces)
def paint_paving(c, region, seed, lat=(0.0, 0.0)):
    """Sidewalk slabs (same look as the sidewalk texture: half-cell slabs on the lattice) inside `region` coverage.
    lat = lattice-relative world offset of the canvas anchor."""
    mx, my = c.MX + lat[0], c.MY + lat[1]
    S = CELL_M / 2
    ia, ib = np.floor(mx / S), np.floor(my / S)
    fa, fb = (mx - ia * S - S / 2) * UPM, (my - ib * S - S / 2) * UPM
    h = (ia.astype(np.int64) * 73856093 ^ ib.astype(np.int64) * 19349663 ^ seed) & 0xFFFF
    r1 = (h % 997) / 997.0
    r2 = ((h // 7) % 991) / 991.0
    d = F.sd_box(fa, fb, 0, 0, 32 - 2.4, 32 - 2.4, 7.0)
    dpx = ab_px(d)
    cov = np.clip(0.5 - dpx / (0.75), 0, 1)
    hgt = np.clip(-dpx / 2.6, 0, 1)
    hgt = (1 - (1 - hgt) ** 2) * 2.4
    lit = screen_relief(c, hgt, 0.6)
    base = lerp3(hexc(SLAB_PAL[0]), hexc(SLAB_PAL[1]), r1)
    base = np.where((r2 < 0.10)[..., None], lerp3(hexc('#E4CFC4'), hexc('#ECDCD2'), r1), base)
    base = np.where((r2 > 0.90)[..., None], lerp3(hexc('#CDD3DB'), hexc('#DBE0E7'), r1), base)
    col = lerp3(base, WHITE, np.clip(lit, 0, 1) * 0.8)
    col = lerp3(col, hexc('#958F98'), np.clip(-lit, 0, 1) * 0.6)
    jcol = hexc('#D6DDE6')
    rgb = lerp3(np.broadcast_to(jcol, col.shape), col, cov)
    rim = np.clip(1 - (-dpx) / 2.6, 0, 1) * (dpx < 0) * 0.5
    rgb = lerp3(rgb, hexc('#F5F7FA'), rim)
    c.paint(region, rgb)


# --------------------------------------------------------------------------- curbs
def render_curb(c, dfn, lat, var=None, paving=None, seed=0):
    """Raised kerb along the boundary of the sidewalk region {dfn > 0} (dfn: world metres -> signed distance, metres).
    lat = lattice-relative world offset of the anchor (joints every half cell on the lattice).  var(mx, my) -> 0..1
    windowed variation amount (straight pieces); paving(c, d0) paints sidewalk slabs first (corner pieces)."""
    d0 = dfn(c.MX, c.MY)
    MX1, MY1 = world(c.DX, c.DY + LIFT)
    d1 = dfn(MX1, MY1)
    if paving is not None:
        paving(c, d0)
    vv = var(c.MX, c.MY) if var is not None else 0.0
    # gutter snow on the road side (ploughed against the curb)
    lx, ly = c.MX + lat[0], c.MY + lat[1]
    gx, gy = grad_world(dfn, c.MX, c.MY)
    along = np.where(np.abs(gx) > np.abs(gy), ly, lx)            # coordinate along the curb (lattice metres)
    wg = 0.07 + 0.05 * psin(along, seed + 1) + 0.05 * vv * psin(along * 2.3, seed + 2)
    gut = d0 + np.maximum(wg, 0.03)
    gcov = c.cov(-gut * ACROSS, 0.6) * c.cov(d0 * ACROSS - 0.5)
    gh = np.clip(gut / 0.08, 0, 1) * 3.0
    glit = screen_relief(c, F.blur(gh, 0.6 * c.ss), 0.8)
    gcol = lerp3(hexc('#EEF2F8'), WHITE, np.clip(glit, 0, 1))
    gcol = lerp3(gcol, hexc('#B9C7DA'), np.clip(-glit, 0, 1) * 0.8)
    c.paint(gcov, gcol)
    # contact shadow on the road in front of a visible face
    faces = np.clip((d0 - d1) / 0.02, 0, 1)                         # 1 where the wall above faces the viewer
    sh = c.cov(-(d0 + 0.07) * ACROSS, 1.5) * c.cov(d0 * ACROSS) * faces
    c.paint(sh, hexc('#8394AE'), 0.45)
    # visible vertical face (only where the wall faces the viewer: d0 > 0 > d1)
    fcov = c.cov(d1 * ACROSS) * c.cov(-d0 * ACROSS)
    t = np.clip(d0 / np.maximum(d0 - d1, 1e-4), 0, 1)
    WX, WY = c.MX + (MX1 - c.MX) * t, c.MY + (MY1 - c.MY) * t
    nx, ny = grad_world(dfn, WX, WY)
    sdx, sdy = screen_dir(-nx, -ny)
    flit = sdx * LXY[0] + sdy * LXY[1]
    fz = np.clip((d0 / np.maximum(d0 - d1, 1e-4)), 0, 1)            # 0 at the base .. 1 at the top edge
    fcol = lerp3(hexc(CURB_FACE[1]), hexc(CURB_FACE[0]), np.clip(0.45 + 0.55 * flit, 0, 1))
    fcol = lerp3(fcol, hexc('#6A7488'), np.clip(0.35 - fz, 0, 1) * 0.6)       # darker toward the foot
    wl_ = np.where(np.abs(nx) > np.abs(ny), WY + lat[1], WX + lat[0])
    jf = np.abs(np.mod(wl_ + CELL_M / 4, CELL_M / 2) - CELL_M / 4)
    fcol = lerp3(fcol, hexc('#5E687A'), np.exp(-(jf / 0.016) ** 2) * 0.8)
    c.paint(fcov, fcol)
    # top band 0 <= d1 <= WT
    band = np.maximum(-d1, d1 - WT)
    tcov = c.cov(band * ACROSS)
    th = (F.smoothstep(0.0, 0.045, d1) * F.smoothstep(WT, WT - 0.045, d1)) * 3.0
    tlit = screen_relief(c, F.blur(th, 0.5 * c.ss), 0.7)
    tl = np.clip((d1) / WT, 0, 1)
    tcol = lerp3(hexc(CURB_TOP[0]), hexc(CURB_TOP[1]), tl * 0.6)
    gn = F.fft_noise(*c.a.shape, seed + 7, scale=1.2 * c.ss)
    tcol = lerp3(tcol, hexc('#B6BECB'), np.clip(gn - 1.3, 0, 1) * 0.4)
    tcol = lerp3(tcol, WHITE, np.clip(tlit, 0, 1) * 0.8)
    tcol = lerp3(tcol, hexc('#8C97A9'), np.clip(-tlit, 0, 1) * 0.7)
    tx, ty = MX1 + lat[0], MY1 + lat[1]
    g1x, g1y = grad_world(dfn, MX1, MY1)
    tal = np.where(np.abs(g1x) > np.abs(g1y), ty, tx)
    jt = np.abs(np.mod(tal + CELL_M / 4, CELL_M / 2) - CELL_M / 4)
    tcol = lerp3(tcol, hexc('#7C8698'), np.exp(-(jt / 0.014) ** 2) * 0.75)
    # snow caps on the top (periodic + windowed variation)
    cap = 0.5 + 0.5 * psin(tal, seed + 3, 2, 5, 0.3)
    cap = np.clip((cap - 0.62) * 3.0 + vv * (psin(tal * 1.7, seed + 4) - 0.1) * 1.6, 0, 1)
    cap = cap * F.smoothstep(0.02, 0.07, d1) * F.smoothstep(WT, WT - 0.06, d1)
    tcol = lerp3(tcol, hexc('#F8FAFD'), cap)
    c.paint(tcov, tcol)
    # crisp outline of the top's road-side edge (separates the stone from the road)
    edge = c.cov((np.abs(d1) - 0.012) * ACROSS, 0.2) * (1 - c.cov(-d0 * ACROSS) * c.cov(d1 * ACROSS))
    c.paint(edge * c.cov(-(d1 - 0.02) * ACROSS), hexc('#7A8597'), 0.55)


def curb_straight(axis, far, variant):
    vmin, vmax = -0.36, 0.42
    fr = straight_frame(axis, -vmax, vmax, lift=LIFT, pad=3)
    c = fr.canvas()
    if axis == 'x':
        sgn = 1 if far else -1
        dfn = lambda mx, my: sgn * my
        lat = (CELL_M / 2, 0.0)
        ucoord = c.MX
    else:
        sgn = -1 if far else 1
        dfn = lambda mx, my: sgn * mx
        lat = (0.0, CELL_M / 2)
        ucoord = c.MY
    if variant:
        rng = np.random.default_rng(300 + variant * 17 + (axis == 'y') * 5 + far)
        amp = rng.uniform(0.6, 1.0)
        var = lambda mx, my: window(ucoord) * amp
    else:
        var = None
    render_curb(c, dfn, lat, var, seed=40 + variant * 11)
    return keep_mask(c.image(), straight_keep(fr, axis)), fr


def curb_corner(q, inner):
    sx, sy = SIDES[q]
    m = 0.5
    fr = corner_frame(sx, sy, m, lift=LIFT, pad=3)
    c = fr.canvas()
    if inner:
        dfn = lambda mx, my: -rquarter(sx * mx, sy * my, R_CURB_IN)

        def pav(cc, d0):
            notch = (sx * cc.MX > 0) & (sy * cc.MY > 0)
            paint_paving(cc, cc.cov(-d0 * ACROSS) * notch, 77)
    else:
        dfn = lambda mx, my: rquarter(sx * mx, sy * my, R_CURB)

        def pav(cc, d0):
            paint_paving(cc, cc.cov(-d0 * ACROSS), 55)
    render_curb(c, dfn, (0.0, 0.0), None, paving=pav, seed=40)
    return keep_mask(c.image(), corner_keep(fr, sx, sy, m)), fr


# --------------------------------------------------------------------------- snow banks
def crumbs_along(c, lat, d_of, along_axis, seed, lo=-0.16, hi=-0.03):
    """A couple of small irregular snow clumps per cell on the road side of an edge, at lattice-periodic positions."""
    r = np.random.default_rng(seed)
    lx, ly = c.MX + lat[0], c.MY + lat[1]
    al = lx if along_axis == 'x' else ly
    best = np.full(c.MX.shape, 9.0, np.float32)
    for k in range(2):
        p, o, rr = r.uniform(0, CELL_M), r.uniform(lo, hi), r.uniform(0.035, 0.06)
        for (dp, do, f) in ((0, 0, 1.0), (rr * 1.1, rr * 0.3, 0.7), (-rr * 0.8, -rr * 0.4, 0.55)):
            da = np.abs(np.mod(al - p - dp + CELL_M / 2, CELL_M) - CELL_M / 2)
            best = np.minimum(best, np.hypot(da, d_of - o - do) - rr * f)
    return best


def render_snow(c, dfn, lat, wob, crumb_d, seed=0, wob_fine=0.0):
    """Soft snow bank on the {dfn > 0} side of an edge: crisp wavy silhouette toward the road (wob + wob_fine),
    a rounded mound lit by the sun (only the smooth wob shapes it), fading out into ground_snow by ~0.95 m."""
    d_mound = dfn(c.MX, c.MY) + wob
    d = d_mound + wob_fine
    fade = F.smoothstep(0.95, 0.42, d_mound)
    present = c.cov(-d * ACROSS, 0.5)
    hm = (F.smoothstep(-0.01, 0.18, d_mound) * (1 - F.smoothstep(0.24, 0.95, d_mound))) * 0.17 \
        + F.smoothstep(0.0, 0.5, d_mound) * 0.03
    lit = screen_relief(c, F.blur(hm * ZPX, 1.4 * c.ss), 1.25)
    col = lerp3(SNOW, WHITE, np.clip(lit, 0, 1) * 0.95)
    col = lerp3(col, hexc('#BCCADD'), np.clip(-lit, 0, 1) * 0.9)
    nz = F.fft_noise(*c.a.shape, seed + 5, scale=3 * c.ss)
    col = lerp3(col, hexc('#E2E9F3'), np.clip(nz - 1.0, 0, 1) * 0.4)
    # cool contact shadow just on the road side of the edge
    ct = c.cov(-(d + 0.045) * ACROSS, 0.8) * (1 - present)
    c.paint(ct, hexc('#9DB0CA'), 0.45)
    if crumb_d is not None:
        cr = c.cov(crumb_d * ACROSS, 0.3)
        c.shadow(cr, dx=0.6, dy=0.8, sigma=0.6, color='#8EA2C0', opacity=0.25)
        clit = screen_relief(c, F.blur(cr, 0.8 * c.ss) * 2.0, 1.0)
        ccol = lerp3(hexc('#F2F6FB'), WHITE, np.clip(clit, 0, 1))
        ccol = lerp3(ccol, hexc('#C3CFE0'), np.clip(-clit, 0, 1))
        c.paint(cr, ccol)
    c.paint(present * fade, col)


def snow_straight(axis, far, variant):
    sgn = (1 if far else -1) if axis == 'x' else (-1 if far else 1)
    fr = straight_frame(axis, -0.42, 1.0, pad=3) if sgn > 0 else straight_frame(axis, -1.0, 0.42, pad=3)
    c = fr.canvas()
    if axis == 'x':
        dfn = lambda mx, my: sgn * my
        lat = (CELL_M / 2, 0.0)
        u = c.MX
        al = c.MX + lat[0]
    else:
        dfn = lambda mx, my: sgn * mx
        lat = (0.0, CELL_M / 2)
        u = c.MY
        al = c.MY + lat[1]
    sd = 500 + (axis == 'y') * 50
    wob = 0.045 * psin(al, sd, 1, 4)
    fine = 0.018 * psin(al, sd + 1, 5, 11)
    if variant:
        r = np.random.default_rng(600 + variant * 13 + (axis == 'y') * 3 + far)
        wob = wob + window(u, 0.2, 0.15) * (0.06 * psin(al * r.uniform(0.7, 1.3), sd + 10 + variant, 1, 3)
                                          + r.uniform(-0.02, 0.05))
    d_of = dfn(c.MX, c.MY)
    crumbs = crumbs_along(c, lat, d_of, axis, 700 + (axis == 'y'))
    if variant:
        r2 = np.random.default_rng(710 + variant)
        uu, vv, rr = r2.uniform(-0.35, 0.35), -r2.uniform(0.05, 0.14), r2.uniform(0.04, 0.065)
        uc = c.MX if axis == 'x' else c.MY
        crumbs = np.minimum(crumbs, np.hypot(uc - uu, d_of - vv) - rr)
        crumbs = np.minimum(crumbs, np.hypot(uc - uu - rr, d_of - vv + rr * 0.4) - rr * 0.6)
    render_snow(c, dfn, lat, wob, crumbs, seed=sd + variant, wob_fine=fine)
    return keep_mask(c.image(), straight_keep(fr, axis)), fr


def snow_corner(q, inner):
    sx, sy = SIDES[q]
    m = 0.45 if not inner else 1.0
    fr = corner_frame(sx, sy, m, pad=3)
    c = fr.canvas()
    r = R_SNOW_IN if inner else R_SNOW
    if inner:
        dfn = lambda mx, my: -rquarter(sx * mx, sy * my, r)
    else:
        dfn = lambda mx, my: rquarter(sx * mx, sy * my, r)
    p, qq = sx * c.MX, sy * c.MY
    wx = F.smoothstep(-0.25, 0.25, p - qq)                      # 1 near the X-direction edge (q ~ 0)
    wob = 0.045 * psin(c.MX, 500, 1, 4) * wx + 0.045 * psin(c.MY, 550, 1, 4) * (1 - wx)
    fine = 0.018 * psin(c.MX, 501, 5, 11) * wx + 0.018 * psin(c.MY, 551, 5, 11) * (1 - wx)
    d_of = dfn(c.MX, c.MY)
    cx = crumbs_along(c, (0.0, 0.0), d_of, 'x', 700)
    cy = crumbs_along(c, (0.0, 0.0), d_of, 'y', 701)
    crumbs = np.where(wx > 0.5, cx, cy)
    near_arc = (p < r + 0.05) & (qq < r + 0.05)
    crumbs = np.where(near_arc, 9.0, crumbs)
    render_snow(c, dfn, (0.0, 0.0), wob, crumbs, seed=520, wob_fine=fine)
    return keep_mask(c.image(), corner_keep(fr, sx, sy, m)), fr


# --------------------------------------------------------------------------- markings
def paint_marking(c, d_m, top, edge, seed, wear=0.25):
    cov = c.cov(d_m * ACROSS, 0.25)
    nz = F.fft_noise(*c.a.shape, seed, scale=1.6 * c.ss)
    nz2 = F.fft_noise(*c.a.shape, seed + 1, scale=6 * c.ss)
    a = np.clip(1.0 - np.clip(nz2 * 0.5 + nz * 0.35 - 0.6, 0, 1) * wear * 2.2, 0.35, 1.0) * 0.96
    col = lerp3(hexc(edge), hexc(top), np.clip(-d_m * ACROSS / 1.6, 0, 1))
    col = lerp3(col, hexc('#F7FAFD'), np.clip(nz - 1.6, 0, 1) * 0.8)        # snow specks
    c.paint(cov * a, col)


def lane(axis):
    L = 2 * CELL_M
    fr = Frame([((u, v) if axis == 'x' else (v, u)) for u in (-L / 2, L / 2) for v in (-0.2, 0.2)], pad=3)
    c = fr.canvas()
    u, v = (c.MX, c.MY) if axis == 'x' else (c.MY, c.MX)
    d = F.sd_box(u, v, 0, 0, 0.8, 0.075, 0.06)
    paint_marking(c, d, '#FFCB45', '#E3A21F', 801 + (axis == 'y'), wear=0.2)
    return c.image(), fr


def crosswalk(axis):
    h = CELL_M / 2
    fr = Frame([((u, v) if axis == 'x' else (v, u)) for u in (-h, h) for v in (-h, h)], pad=3)
    c = fr.canvas()
    u, v = (c.MX, c.MY) if axis == 'x' else (c.MY, c.MX)
    d = np.minimum(F.sd_box(u, v, 0, -CELL_M / 4, h - 0.13, 0.185, 0.05),
                   F.sd_box(u, v, 0, CELL_M / 4, h - 0.13, 0.185, 0.05))
    paint_marking(c, d, '#FBFAF6', '#D9DCE2', 811 + (axis == 'y'), wear=0.3)
    return c.image(), fr


def stall(axis):
    Lh, Wh = 1.5 * CELL_M, CELL_M
    fr = Frame([((u, v) if axis == 'x' else (v, u)) for u in (-Lh, Lh) for v in (-Wh, Wh)], pad=4)
    c = fr.canvas()
    u, v = (c.MX, c.MY) if axis == 'x' else (c.MY, c.MX)
    lw = 0.055
    side = np.minimum(F.sd_box(u, v, 0.08, -Wh, Lh - 0.2, lw, 0.03), F.sd_box(u, v, 0.08, Wh, Lh - 0.2, lw, 0.03))
    back = F.sd_box(u, v, Lh - 0.17, 0, lw, Wh, 0.03)
    paint_marking(c, np.minimum(side, back), '#F7F6F1', '#D3D7DE', 821 + (axis == 'y'), wear=0.25)
    return c.image(), fr


def intersection():
    """Composite of the four curb_corner pieces of a standard 4-way junction (carriageway 4 cells, sidewalks 1+1)."""
    parts = []
    for q, (sx, sy) in SIDES.items():
        img, fr = curb_corner(q, False)
        ox, oy = screen(sx * 2 * CELL_M, sy * 2 * CELL_M)
        parts.append((img, fr, int(round(ox)), int(round(oy))))
    x0 = min(ox - fr.ax for img, fr, ox, oy in parts)
    y0 = min(oy - fr.ay for img, fr, ox, oy in parts)
    x1 = max(ox - fr.ax + fr.w for img, fr, ox, oy in parts)
    y1 = max(oy - fr.ay + fr.h for img, fr, ox, oy in parts)
    W, H = x1 - x0 + (x1 - x0) % 2, y1 - y0 + (y1 - y0) % 2
    out = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    for img, fr, ox, oy in parts:
        out.alpha_composite(img, (ox - fr.ax - x0, oy - fr.ay - y0))
    fr = Frame.__new__(Frame)
    fr.w, fr.h, fr.ax, fr.ay = W, H, -x0, -y0
    return out, fr


# =========================================================================== registry
EDGE_DOC = {
    ('curb', 'x', True): 'Curb on the +Y edge of a road along X (walk at +Y, road at -Y; screen-upper edge, face visible).',
    ('curb', 'x', False): 'Curb on the -Y edge of a road along X (walk at -Y, road at +Y; screen-lower edge, top only).',
    ('curb', 'y', True): 'Curb on the -X edge of a road along Y (walk at -X, road at +X; screen-upper-left edge, face visible).',
    ('curb', 'y', False): 'Curb on the +X edge of a road along Y (walk at +X, road at -X; screen-lower-right edge, top only).',
    ('snow', 'x', True): 'Snow bank along an X edge with the snow (NONE cell) at +Y and paving at -Y.',
    ('snow', 'x', False): 'Snow bank along an X edge with the snow at -Y and paving at +Y.',
    ('snow', 'y', True): 'Snow bank along a Y edge with the snow at -X and paving at +X.',
    ('snow', 'y', False): 'Snow bank along a Y edge with the snow at +X and paving at -X.',
}
CORNER_DOC = {
    'curb_corner': 'Rounded convex sidewalk corner (r 1.0 m): the cell in its quarter is WALK, the other three ROAD. Paints '
                   'its own paving; fill its cell with the carriageway texture first.',
    'curb_inner': 'Concave curb (outside of a bend): the cell in its quarter is ROAD, the other three WALK. Rounds the road '
                  'corner (r 0.55 m) with paving.',
    'snow_corner': 'Corner of a snowy block (r 0.6 m): the cell in its quarter is NONE, the other three paved.',
    'snow_inner': 'Concave snow corner (outside of a bend / dead end): the cell in its quarter is paved, the other three NONE.',
}


def piece_specs():
    """[(key, fn, meta)] for every frame in the roads_decals atlas."""
    out = []
    for fam in ('snow', 'curb'):
        for axis in 'xy':
            for far in (True, False):
                base = ('curb_' if fam == 'curb' else 'snow_edge_') + axis + ('' if far else '_near')
                for v in range(3):
                    key = base if v == 0 else '%s_%d' % (base, v)
                    fn = (lambda a=axis, f=far, v=v: curb_straight(a, f, v)) if fam == 'curb' else \
                        (lambda a=axis, f=far, v=v: snow_straight(a, f, v))
                    meta = {'piece': 'edge', 'family': fam, 'axis': axis, 'side': 'far' if far else 'near',
                            'step': [64, 32] if axis == 'x' else [64, -32], 'cells': 1, 'variantOf': base,
                            'layer': 4 if fam == 'curb' else 3,
                            'notes': EDGE_DOC[(fam, axis, far)] + ' 1 cell long; anchor = midpoint of the cell edge.'}
                    if v == 0:
                        meta['variants'] = [base, base + '_1', base + '_2']
                    out.append((key, fn, meta))
    for fam in ('snow_corner', 'snow_inner', 'curb_corner', 'curb_inner'):
        for q, sg in SIDES.items():
            key = '%s_%s' % (fam, q)
            if fam.startswith('curb'):
                fn = (lambda q=q, inner=fam.endswith('inner'): curb_corner(q, inner))
            else:
                fn = (lambda q=q, inner=fam.endswith('inner'): snow_corner(q, inner))
            out.append((key, fn, {'piece': 'corner', 'family': fam, 'quarter': list(sg), 'quarterDir': q,
                                  'layer': 4 if fam.startswith('curb') else 3,
                                  'notes': CORNER_DOC[fam] + ' Anchor = the lattice point; owns the first cell of both '
                                           'edges leaving it toward its quarter.'}))
    out += [
        ('lane_x', lambda: lane('x'), {'piece': 'marking', 'axis': 'x', 'cells': 2, 'step': [128, 64], 'layer': 5,
                                       'notes': 'Yellow dashed centre line on a road along X: dash 1.6 m in a 2-cell span. '
                                                'Anchor = centre of the span on the centre line.'}),
        ('lane_y', lambda: lane('y'), {'piece': 'marking', 'axis': 'y', 'cells': 2, 'step': [128, -64], 'layer': 5,
                                       'notes': 'Yellow dashed centre line on a road along Y.'}),
        ('crosswalk_x', lambda: crosswalk('x'), {'piece': 'marking', 'axis': 'x', 'cells': 1, 'layer': 5,
                                                 'notes': 'Zebra module (2 stripes) for a road along X (people cross along '
                                                          'Y): one per carriageway cell across the road. Anchor = cell centre.'}),
        ('crosswalk_y', lambda: crosswalk('y'), {'piece': 'marking', 'axis': 'y', 'cells': 1, 'layer': 5,
                                                 'notes': 'Zebra module for a road along Y (people cross along X).'}),
        ('stall_lines', lambda: stall('x'), {'piece': 'marking', 'axis': 'x', 'cellsAcross': 2, 'cellsAlong': 3,
                                             'layer': 5, 'stallPoint': [0, 0], 'carHeading': 'X+ / X-',
                                             'notes': 'One parking stall, car parked along X: 2 cells wide (Y) x 3 cells '
                                                      'long (X), closed end at +X (flipX+flipY for the other way). Stalls '
                                                      'side by side step (64, -32) x 2 = (128, -64). Anchor = stall centre.'}),
        ('stall_lines_y', lambda: stall('y'), {'piece': 'marking', 'axis': 'y', 'cellsAcross': 2, 'cellsAlong': 3,
                                               'layer': 5, 'stallPoint': [0, 0], 'carHeading': 'Y+ / Y-',
                                               'notes': 'One parking stall, car parked along Y; closed end at +Y. Stalls '
                                                        'side by side step (128, 64).'}),
        ('intersection', intersection, {'piece': 'composite', 'layer': 4,
                                        'notes': 'The 4 curb_corner pieces of a standard 4-way city junction '
                                                 '(4-cell carriageways + 1-cell sidewalks) in one frame; anchor = junction '
                                                 'centre (a lattice point). Fill the whole 6x6-cell block with asphalt first.'}),
    ]
    return out


# =========================================================================== grid compositor (mirrors the game rules)
NONE, ROAD, WALK = 0, 1, 2


def lattice_px(G, i, j):
    return G[0] + 64 * (i + j), G[1] + 32 * (i - j)


class Grid:
    """Cell grid: type + texture per cell.  Mirrors the placement algorithm documented in the module docstring."""

    def __init__(self):
        self.t, self.tex = {}, {}

    def rect(self, kind, tex, i0, i1, j0, j1):
        for i in range(i0, i1):
            for j in range(j0, j1):
                self.t[(i, j)] = kind
                self.tex[(i, j)] = tex

    def kind(self, i, j):
        return self.t.get((i, j), NONE)

    def fill_tex(self, i, j):
        """Texture to fill a cell with (convex sidewalk corners get the diagonal road's texture)."""
        k = self.kind(i, j)
        if k == WALK:
            for sx, sy in SIDES.values():
                if self.kind(i + sx, j) == ROAD and self.kind(i, j + sy) == ROAD and self.kind(i + sx, j + sy) == ROAD:
                    return self.tex[(i + sx, j + sy)]
        return self.tex.get((i, j))

    def pieces(self):
        """[(key, i, j, kind)] edge / corner pieces: kind 'x' (segment from lattice (i,j) to (i+1,j)), 'y' ((i,j) to
        (i,j+1)) or 'p' (lattice point)."""
        out = []
        ks = list(self.t)
        if not ks:
            return out
        i0, i1 = min(k[0] for k in ks) - 1, max(k[0] for k in ks) + 2
        j0, j1 = min(k[1] for k in ks) - 1, max(k[1] for k in ks) + 2
        for fam in ('snow', 'curb'):
            if fam == 'snow':
                cat = lambda i, j: 'm' if self.kind(i, j) == NONE else 'p'           # material = snow
                rel = lambda i, j: True
            else:
                cat = lambda i, j: 'm' if self.kind(i, j) == WALK else ('p' if self.kind(i, j) == ROAD else None)
                rel = None
            owned = set()
            for i in range(i0, i1 + 1):
                for j in range(j0, j1 + 1):
                    quads = {q: cat(i + (sx - 1) // 2, j + (sy - 1) // 2) for q, (sx, sy) in SIDES.items()}
                    if None in quads.values():
                        continue
                    mats = [q for q, v in quads.items() if v == 'm']
                    if len(mats) == 1:
                        q = mats[0]
                        key = ('snow_corner_' if fam == 'snow' else 'curb_corner_') + q
                    elif len(mats) == 3:
                        q = [q for q, v in quads.items() if v == 'p'][0]
                        key = ('snow_inner_' if fam == 'snow' else 'curb_inner_') + q
                    else:
                        continue
                    sx, sy = SIDES[q]
                    out.append((key, i, j, 'p'))
                    owned.add(('x', i if sx > 0 else i - 1, j))
                    owned.add(('y', i, j if sy > 0 else j - 1))
            for i in range(i0, i1 + 1):
                for j in range(j0, j1 + 1):
                    v = (i * 7 + j * 13) % 3
                    # X segment (i,j)-(i+1,j) between cells (i, j-1) [-Y] and (i, j) [+Y]
                    lo, hi = cat(i, j - 1), cat(i, j)
                    if lo and hi and lo != hi and ('x', i, j) not in owned:
                        base = ('snow_edge_x' if fam == 'snow' else 'curb_x') + ('' if hi == 'm' else '_near')
                        out.append((base + ('' if v == 0 else '_%d' % v), i, j, 'x'))
                    # Y segment (i,j)-(i,j+1) between cells (i-1, j) [-X] and (i, j) [+X]
                    lo, hi = cat(i - 1, j), cat(i, j)
                    if lo and hi and lo != hi and ('y', i, j) not in owned:
                        base = ('snow_edge_y' if fam == 'snow' else 'curb_y') + ('' if lo == 'm' else '_near')
                        out.append((base + ('' if v == 0 else '_%d' % v), i, j, 'y'))
        return out


def piece_anchor_px(G, i, j, kind):
    x, y = lattice_px(G, i, j)
    if kind == 'x':
        return x + 32, y + 16
    if kind == 'y':
        return x + 32, y - 16
    return x, y


def compose(grid, G, size, tex_imgs, piece_imgs, markings=(), sprites=(), snow_img=None):
    """Bake a ground picture exactly the way the game should: snow, textures per cell (pattern origin G), snow edges,
    curbs, markings; then depth-sorted sprites [(rgba, anchor_x, anchor_y, ax_px, ay_px)]."""
    W, H = size
    ys, xs = np.mgrid[0:H, 0:W].astype(np.float32)
    A = (xs + 0.5 - G[0]) + 2 * (ys + 0.5 - G[1])
    B = (xs + 0.5 - G[0]) - 2 * (ys + 0.5 - G[1])
    ci, cj = np.floor(A / CELL).astype(np.int64), np.floor(B / CELL).astype(np.int64)

    def tiled(img):
        a = np.asarray(img.convert('RGBA'))
        a = np.roll(a, (G[1] % N, G[0] % N), (0, 1))
        return np.tile(a, (H // N + 2, W // N + 2, 1))[:H, :W]

    out = tiled(snow_img).copy()
    keymap = {}
    for (i, j) in grid.t:
        keymap.setdefault(grid.fill_tex(i, j), []).append((i, j))
    for tk, cells in keymap.items():
        sel = np.zeros((H, W), bool)
        cs = set(cells)
        # vectorised membership: encode cell ids
        code = ci * 100003 + cj
        ids = np.array([i * 100003 + j for i, j in cs], np.int64)
        sel = np.isin(code, ids)
        out[sel] = tiled(tex_imgs[tk])[sel]
    canvas = Image.fromarray(out, 'RGBA')
    plist = grid.pieces()
    order = {'snow': 0, 'curb': 1}
    plist.sort(key=lambda p: order['curb' if p[0].startswith('curb') else 'snow'])
    for key, i, j, kind in plist:
        img, fr = piece_imgs[key]
        x, y = piece_anchor_px(G, i, j, kind)
        canvas.alpha_composite(img, (int(x - fr.ax), int(y - fr.ay)))
    for key, (x, y) in markings:
        img, fr = piece_imgs[key]
        canvas.alpha_composite(img, (int(x - fr.ax), int(y - fr.ay)))
    for img, x, y, axp, ayp in sorted(sprites, key=lambda s: s[2]):
        canvas.alpha_composite(img, (int(round(x - axp)), int(round(y - ayp))))
    return canvas, plist


# =========================================================================== manifest
CLASSES = {
    'dirt': {'era': 'village (마을)', 'textures': {'x': 'road_dirt', 'y': 'road_dirt_y', 'junction': 'road_dirt_cross'},
             'laneCells': 2, 'lanes': [1, 2], 'sidewalkCells': 0, 'curbs': False, 'markings': False,
             'edges': 'snow_edge_* / snow_corner_* / snow_inner_* between ROAD and NONE cells'},
    'town': {'era': 'town (읍)', 'textures': {'x': 'road_cobble_wide', 'y': 'road_cobble_wide',
                                             'junction': 'road_cobble_wide'},
             'laneCells': 2, 'lanes': [2], 'sidewalkCells': 0, 'curbs': False, 'markings': False,
             'edges': 'snow pieces between ROAD and NONE (optional sidewalks + curbs like the city)'},
    'city': {'era': 'city (도시)', 'textures': {'x': 'road_asphalt', 'y': 'road_asphalt', 'junction': 'road_asphalt',
                                               'walk': 'sidewalk'},
             'laneCells': 2, 'lanes': [2], 'sidewalkCells': 1, 'curbs': True, 'markings': True,
             'edges': 'curbs between ROAD and WALK; snow pieces between WALK and NONE'},
}

ROADKIT = {
    'cellM': CELL_M,
    'cellPx': {'x': [64, 32], 'y': [64, -32]},
    'diamondPx': [128, 64],
    'unitsPerCell': CELL, 'unitsPerMetre': round(UPM, 3),
    'gridOrigin': 'one integer screen point G for the whole world; lattice (i, j) = G + i*(64,32) + j*(64,-32); '
                  'cell (i, j) has its min corner at lattice (i, j). a = x + 2y, b = x - 2y (x, y from G): '
                  'i = floor(a/128), j = floor(b/128).',
    'textureOrigin': 'every texture is drawn as a repeating pattern with its top-left pixel corner at G, scale 1. '
                     'Inside a texture the cell lines are a = 0 (mod 128) and b = 0 (mod 128).',
    'widthsM': {'lane': 2 * CELL_M, 'carriageway2': 4 * CELL_M, 'track1': 2 * CELL_M, 'sidewalk': CELL_M,
                'cityStreet': 6 * CELL_M},
    'widthsCells': {'lane': 2, 'carriageway2': 4, 'track1': 2, 'sidewalk': 1, 'cityStreet': 6},
    'alignment': 'carriageway edges and the centre line between lanes on EVEN grid lines; lane centres on odd lines '
                 '(the ruts of road_dirt* follow lane centres +-0.75 m).',
    'classes': CLASSES,
    'layers': ['1 ground_snow', '2 textures per cell (pattern origin G; fill each texture\'s cells as one path)',
               '3 snow_edge_* / snow_corner_* / snow_inner_*', '4 curb_* / curb_corner_* / curb_inner_* (or intersection)',
               '5 lane_* / crosswalk_* / stall_lines*', 'then depth-sorted sprites (vehicles, people, buildings)'],
    'cellTypes': 'NONE (snow) / ROAD (carriageway) / WALK (sidewalk). A WALK cell with ROAD on two orthogonal sides '
                 'and on the diagonal between them (a convex sidewalk corner) is filled with the carriageway texture; '
                 'its curb_corner piece paints the paving.',
    'edgeRule': 'For every cell edge between a ROAD and a WALK cell draw a curb piece, between a paved (ROAD/WALK) and a '
                'NONE cell a snow piece. X edge = segment lattice (i,j)-(i+1,j) between cells (i,j-1) and (i,j): '
                '*_x if the walk/snow cell is (i,j) (+Y), *_x_near if it is (i,j-1). Y edge = segment (i,j)-(i,j+1) '
                'between cells (i-1,j) and (i,j): *_y if the walk/snow cell is (i-1,j) (-X), *_y_near if (i,j). '
                'Anchor of an X edge piece = lattice (i,j) + (32,16); of a Y edge piece = lattice (i,j) + (32,-16). '
                'Variant = ((i*7 + j*13) % 3 + 3) % 3 -> key, key_1, key_2.',
    'cornerRule': 'At every lattice point look at the 4 cells around it; quarter q (e=+X+Y, s=+X-Y, w=-X-Y, n=-X+Y) '
                  'holds cell (i + (sx-1)/2, j + (sy-1)/2). Curbs (only when all 4 cells are ROAD/WALK): exactly one '
                  'WALK -> curb_corner_q of that quarter; exactly one ROAD -> curb_inner_q. Snow: exactly one NONE -> '
                  'snow_corner_q; exactly one paved -> snow_inner_q. A corner piece owns the X edge leaving the point '
                  'toward sx and the Y edge toward sy: skip the straight pieces there. Keep every straight run >= 2 '
                  'cells (no 1-cell stubs between two corners); diagonal 2+2 cell patterns are not supported.',
    'markingRule': 'lane_x / lane_y every 2 cells on the carriageway centre line (anchor = lattice point on the centre '
                   'line + (64,32) / (64,-32)); crosswalk_x on each carriageway cell of a road along X where a sidewalk '
                   'line crosses it (the junction border cells), anchor = lattice (i,j) + (64,0); crosswalk_y likewise. '
                   'stall_lines: anchor = stall centre = lattice of its min corner + (160,16) (2 across Y, 3 along X).',
    'pieceFrames': 'roads_decals frames are UNTRIMMED (pack trim=False) and anchored on an integer pixel '
                   '(anchorPx); draw at round(anchor) - anchorPx. Straight pieces own exactly the pixels whose centre '
                   'lies in their 1-cell slice, so consecutive pieces join with no overlap and no gap.',
}


def manifest(tex_meta, piece_meta, atlas_json):
    frames = atlas_json['frames']
    m = {
        'version': 1,
        'generator': 'tools/fx/gen_roads.py',
        'conventions': {
            'text': 'Road kit (CONTRACT_V5 §N). See roadKit for the grid, widths, layer order and placement rules.',
            'projection': '+1 m world X = screen (+45.25, +22.63) px, +1 m world Y = (+45.25, -22.63) px; one road cell = '
                          'sqrt(2) m = (64, 32) px along X, (64, -32) along Y.',
            'textures': '512x512, seamless in x and y, draw at scale 1 as patterns anchored at the grid origin G.',
            'blend': 'All decals are NORMAL-blend artwork baked into the ground (below depth-sorted sprites).',
        },
        'roadKit': ROADKIT,
        'atlases': [{'key': ATLAS, 'png': 'roads/%s.png' % ATLAS, 'json': 'roads/%s.json' % ATLAS}],
        'images': [{'key': k, 'png': 'roads/%s.png' % k} for k in TEXTURES],
        'sprites': {},
    }
    for k, meta in tex_meta.items():
        m['sprites'][k] = dict({'image': k, 'anchor': [0, 0], 'kind': 'tile', 'tile': 'xy', 'frameSize': [N, N]}, **meta)
    for k, (meta, fr) in piece_meta.items():
        e = {'atlas': ATLAS, 'frame': k, 'anchor': fr.anchor(), 'anchorPx': [fr.ax, fr.ay], 'frameSize': [fr.w, fr.h],
             'kind': 'decal', 'trimmed': False}
        e.update(meta)
        assert k in frames
        m['sprites'][k] = e
    return m


# =========================================================================== previews
def font(size=14):
    from PIL import ImageFont
    for p in ('/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc', '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
              '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'):
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()


def label(d, xy, text, size=14, fill=(43, 47, 58, 255), bg=(255, 255, 255, 215)):
    f = font(size)
    x, y = xy
    bb = d.textbbox((x, y), text, font=f)
    d.rounded_rectangle([bb[0] - 5, bb[1] - 3, bb[2] + 5, bb[3] + 3], 6, fill=bg)
    d.text((x, y), text, font=f, fill=fill)


def sheet_preview(tex_imgs, piece_imgs, path):
    """Contact sheet: textures (2x2 tiled at half size) + every piece on a mid-grey checker with its anchor."""
    keys = list(piece_imgs)
    cellw, cellh = 230, 150
    cols = 8
    rows = (len(keys) + cols - 1) // cols
    W = cols * cellw + 20
    th = 300
    H = th + 40 + rows * cellh + 30
    im = Image.new('RGBA', (W, H), (232, 237, 244, 255))
    d = ImageDraw.Draw(im)
    label(d, (10, 6), 'roads - CONTRACT_V5 §N: textures (2x2 tiles at 1/2 scale) and roads_decals pieces at 1x '
                      '(pink cross = anchor; checker = transparent)', 14)
    x = 10
    for k, t in tex_imgs.items():
        big = Image.new('RGB', (2 * N, 2 * N))
        for a in range(2):
            for b in range(2):
                big.paste(t.convert('RGB'), (a * N, b * N))
        small = big.resize((256, 256), Image.LANCZOS)
        im.paste(small, (x, 34))
        label(d, (x + 4, 34 + 258 - 2), k, 12)
        x += 268
    y0 = th + 40
    chk = Image.new('RGBA', (cellw, cellh))
    cd = ImageDraw.Draw(chk)
    for yy in range(0, cellh, 10):
        for xx in range(0, cellw, 10):
            cd.rectangle([xx, yy, xx + 9, yy + 9], fill=(196, 202, 212, 255) if (xx + yy) // 10 % 2 else (176, 183, 195, 255))
    for n, k in enumerate(keys):
        img, fr = piece_imgs[k]
        cx, cy = 10 + (n % cols) * cellw, y0 + (n // cols) * cellh
        im.paste(chk, (cx, cy))
        sc = min(1.0, (cellw - 10) / img.width, (cellh - 26) / img.height)
        sm = img if sc == 1.0 else img.resize((max(1, int(img.width * sc)), max(1, int(img.height * sc))), Image.LANCZOS)
        ox, oy = cx + (cellw - sm.width) // 2, cy + 4 + (cellh - 26 - sm.height) // 2
        im.alpha_composite(sm, (ox, oy))
        axp, ayp = ox + fr.ax * sc, oy + fr.ay * sc
        d.line([(axp - 5, ayp), (axp + 5, ayp)], fill=(255, 0, 110, 255), width=2)
        d.line([(axp, ayp - 5), (axp, ayp + 5)], fill=(255, 0, 110, 255), width=2)
        d.text((cx + 4, cy + cellh - 18), k + ('' if sc == 1.0 else '  (x%.2f)' % sc), font=font(11), fill=(30, 34, 44))
    im.convert('RGB').save(path, optimize=True)


def load_sprite(folder, key):
    """(rgba PIL, ax_px, ay_px) of a sprites[] entry of another fragment (read-only), or None."""
    import check_assets as CA
    try:
        f = CA.Frag(folder)
        a = f.sprite_rgba(key)
    except Exception:
        return None
    if a is None:
        return None
    s = f.sprites[key]
    im = Image.fromarray(np.asarray(a), 'RGBA')
    return im, s['anchor'][0] * im.width, s['anchor'][1] * im.height


def load_char(folder, key, frame):
    path = os.path.join(ROOT, 'assets', folder, 'manifest.json')
    try:
        with open(path, encoding='utf-8') as f:
            m = json.load(f)
        ch = m['characters'][key]
        at = [a for a in m['atlases'] if a['key'] == ch['atlas']][0]
        with open(os.path.join(ROOT, 'assets', at['json']), encoding='utf-8') as f:
            js = json.load(f)
        fr = js['frames'][frame]
        src = Image.open(os.path.join(ROOT, 'assets', at['png'])).convert('RGBA')
        r, ssz, so = fr['frame'], fr['spriteSourceSize'], fr['sourceSize']
        crop = src.crop((r['x'], r['y'], r['x'] + r['w'], r['y'] + r['h']))
        full = Image.new('RGBA', (so['w'], so['h']))
        full.paste(crop, (ssz['x'], ssz['y']))
        an = ch.get('anchor', [0.5, 0.8125])
        return full, an[0] * so['w'], an[1] * so['h']
    except Exception:
        return None


# =========================================================================== scene preview
def _cell_xy(G, i, j):
    """Screen point of a (fractional) lattice coordinate."""
    return G[0] + 64 * (i + j), G[1] + 32 * (i - j)


def _spr(lst, loaded, G, i, j, dy=0):
    if loaded is None:
        return
    img, ax, ay = loaded
    x, y = _cell_xy(G, i, j)
    lst.append((img, x, y + dy, ax, ay))


def _lanes(marks, axis, G, fixed, lo, hi):
    """Dashes every 2 cells on the centre line (lattice line `fixed`) for spans [k, k+2) inside [lo, hi)."""
    k = lo
    while k + 2 <= hi:
        if axis == 'x':
            x, y = lattice_px(G, k, fixed)
            marks.append(('lane_x', (x + 64, y + 32)))
        else:
            x, y = lattice_px(G, fixed, k)
            marks.append(('lane_y', (x + 64, y - 32)))
        k += 2


def scene(tex_imgs, piece_imgs, path):
    snow = Image.open(os.path.join(ROOT, 'assets', 'ground', 'ground_snow.png')).convert('RGBA')
    S = lambda folder, key: load_sprite(folder, key)
    C = lambda folder, key, fr: load_char(folder, key, fr)
    panels = []

    # ---------------------------------------------------------------- village: dirt roads
    G = (640, 300)
    g = Grid()
    g.rect(ROAD, 'road_dirt', -9, 9, -2, 2)
    g.rect(ROAD, 'road_dirt_cross', -2, 2, -2, 2)
    g.rect(ROAD, 'road_dirt_y', -2, 2, 2, 9)
    g.rect(ROAD, 'road_dirt_y', -2, 2, -6, -2)          # dead end at j = -6
    g.rect(ROAD, 'road_dirt_y', 4, 6, -8, -2)           # 1-lane track (lane centre on the odd line i = 5)
    sp = []
    _spr(sp, S('buildings', 'house_a'), G, 4.6, 4.4)
    _spr(sp, S('buildings', 'house_b'), G, -4.6, 4.8)
    _spr(sp, S('buildings', 'house_c'), G, -5.4, -4.6)
    for (i, j, k) in ((7.5, 3.5, 'tree_pine_snow'), (3.2, 7.4, 'tree_pine_a'), (-7.5, 3.0, 'tree_pine_b'),
                      (-3.2, -7.8, 'tree_pine_snow'), (8.4, -4.5, 'tree_pine_snow'), (2.6, -5.0, 'bush_snow')):
        _spr(sp, S('props', k), G, i, j)
    _spr(sp, C('characters', 'player', 'walk_SE_2'), G, 0.3, -0.6)
    _spr(sp, C('characters', 'villager_a', 'walk_NE_1'), G, -5.0, -0.9)
    _spr(sp, C('characters', 'villager_b', 'walk_S_3'), G, 5.0, -4.6)
    _spr(sp, C('characters', 'lumberjack', 'idle_SE_0'), G, -0.9, 5.2)
    cv, _ = compose(g, G, (1280, 760), tex_imgs, piece_imgs, (), sp, snow)
    panels.append((cv, '마을 village: road_dirt / road_dirt_y / road_dirt_cross (2-lane crossroads, dead end, '
                       '1-lane track) + snow_edge / snow_corner / snow_inner'))

    # ---------------------------------------------------------------- town: cobble roads
    G = (600, 392)
    g = Grid()
    g.rect(ROAD, 'road_cobble_wide', -9, 8, -2, 2)
    g.rect(ROAD, 'road_cobble_wide', -2, 2, 2, 9)        # T-junction arm going +Y
    g.rect(ROAD, 'road_cobble_wide', 4, 8, -9, -2)       # L-bend down -Y at the right end
    sp = []
    _spr(sp, S('town', 'townhouse_a'), G, -4.8, 4.9)
    _spr(sp, S('town', 'cafe'), G, 4.9, 5.0)
    _spr(sp, S('town', 'townhouse_c'), G, -4.6, -5.0)
    for (i, j, k) in ((-2.45, 2.9, 'streetlight'), (2.4, 2.45, 'streetlight'), (-6.5, -2.45, 'streetlight'),
                      (3.6, -4.0, 'streetlight')):
        _spr(sp, S('town', k), G, i, j)
    _spr(sp, S('town', 'bench_x'), G, 5.0, 2.6)
    _spr(sp, S('props', 'tree_pine_snow'), G, 9.4, -0.6)
    _spr(sp, C('villagers', 'npc_red', 'walk_SE_1'), G, -6.0, 0.6)
    _spr(sp, C('villagers', 'npc_blue', 'walk_NE_4'), G, 0.7, 5.5)
    _spr(sp, C('villagers', 'npc_yellow', 'idle_S_0'), G, 6.0, -5.5)
    cv, _ = compose(g, G, (1280, 760), tex_imgs, piece_imgs, (), sp, snow)
    panels.append((cv, '읍 town: road_cobble_wide (crossroads T + bend: snow_inner on the outside, snow_corner inside)'))

    # ---------------------------------------------------------------- city: asphalt + sidewalks
    G = (1290, 400)
    g = Grid()
    g.rect(WALK, 'sidewalk', -15, 15, -3, 3)             # sidewalks first, carriageways on top
    g.rect(WALK, 'sidewalk', -9, -3, -10, 10)            # junction A: full 4-way
    g.rect(WALK, 'sidewalk', 3, 9, 2, 10)                # junction B: T going +Y
    g.rect(WALK, 'sidewalk', -4, 6, -9, -3)              # parking lot block with a driveway
    g.rect(ROAD, 'road_asphalt', -15, 15, -2, 2)
    g.rect(ROAD, 'road_asphalt', -8, -4, -10, 10)
    g.rect(ROAD, 'road_asphalt', 4, 8, -2, 10)
    g.rect(ROAD, 'road_asphalt', -3, 5, -8, -2)
    marks = []
    _lanes(marks, 'x', G, 0, -15, -9)
    _lanes(marks, 'x', G, 0, -3, 3)
    _lanes(marks, 'x', G, 0, 9, 15)
    _lanes(marks, 'y', G, -6, -10, -3)
    _lanes(marks, 'y', G, -6, 3, 10)
    _lanes(marks, 'y', G, 6, 3, 10)
    for i in (-9, -4, 3, 8):
        for j in range(-2, 2):
            if i == 8 or i == 3 or True:
                x, y = lattice_px(G, i, j)
                marks.append(('crosswalk_x', (x + 64, y)))
    for j in (-3, 2):
        for i in range(-8, -4):
            x, y = lattice_px(G, i, j)
            marks.append(('crosswalk_y', (x + 64, y)))
    for i in range(4, 8):
        x, y = lattice_px(G, i, 2)
        marks.append(('crosswalk_y', (x + 64, y)))
    for i0 in (-2, 0, 2):                                # 3 stalls, cars along Y, open toward the street (+Y)
        x, y = _cell_xy(G, i0 + 1, -5.5)
        marks.append(('stall_lines_y@flip', (x, y)))
    sp = []
    _spr(sp, S('town', 'apartment_b'), G, -12.0, 6.2)
    _spr(sp, S('town', 'cafe'), G, -0.2, 5.6)
    _spr(sp, S('town', 'clinic'), G, 11.6, 5.6)
    _spr(sp, S('town', 'townhouse_b'), G, -12.0, -5.8)
    _spr(sp, S('town', 'townhouse_d'), G, 11.5, -5.6)
    for (i, j) in ((-9.5, 2.5), (-2.5, 2.5), (2.5, -2.5), (9.5, 2.5), (-3.5, -9.0), (8.6, 8.4), (-12.5, -2.5)):
        _spr(sp, S('town', 'streetlight'), G, i, j)
    _spr(sp, S('town', 'bench_x'), G, -0.4, 2.5)
    for (i, j, f, k) in ((-8.7, 2.5, 'walk_SE_3', 'npc_red'), (-6.3, 2.5, 'walk_NE_2', 'npc_blue'),
                         (-3.6, 0.4, 'walk_N_1', 'npc_kid_girl'), (1.5, 2.5, 'idle_SE_0', 'npc_grandpa'),
                         (6.6, 5.5, 'walk_S_5', 'npc_young_man'), (12.0, -2.6, 'walk_NE_6', 'npc_aunt')):
        _spr(sp, C('villagers', k, f), G, i, j)
    _spr(sp, C('characters', 'player', 'idle_SE_0'), G, -0.95, -3.2)
    cv, _ = compose(g, G, (2580, 800), tex_imgs, piece_imgs, marks_resolve(marks, piece_imgs), sp, snow)
    panels.append((cv, '도시 city: road_asphalt + sidewalk, curb_* / curb_corner / curb_inner, lane_*, crosswalk_*, '
                       'stall_lines_y (flipped), snow pieces outside the sidewalks'))

    # ---------------------------------------------------------------- assemble
    top = Image.new('RGBA', (2580, 760 + 800 + 40 + 6), (255, 255, 255, 255))
    top.alpha_composite(panels[0][0], (0, 0))
    top.alpha_composite(panels[1][0], (1300, 0))
    top.alpha_composite(panels[2][0], (0, 766))
    d = ImageDraw.Draw(top)
    d.rectangle([1280, 0, 1300, 760], fill=(255, 255, 255, 255))
    label(d, (12, 10), panels[0][1], 13)
    label(d, (1312, 10), panels[1][1], 13)
    label(d, (12, 776), panels[2][1], 13)
    d.rectangle([0, top.height - 40, top.width, top.height], fill=(31, 95, 168, 255))
    d.text((14, top.height - 31), 'Frost Village road kit at 1x (PPU 64, cell = sqrt(2) m = 64x32 px step): composed by '
                                  'gen_roads.compose() with the documented grid rules; buildings / people from assets/ '
                                  '(buildings, town, props, characters, villagers) for scale', font=font(15),
           fill=(255, 255, 255))
    top.convert('RGB').save(path, optimize=True)


def marks_resolve(marks, piece_imgs):
    """Expand 'key@flip' (rotate 180 deg = flipX + flipY) into extra piece images."""
    out = []
    for key, xy in marks:
        if key.endswith('@flip'):
            base = key[:-5]
            if key not in piece_imgs:
                img, fr = piece_imgs[base]
                f2 = Frame.__new__(Frame)
                f2.w, f2.h, f2.ax, f2.ay = fr.w, fr.h, fr.w - fr.ax, fr.h - fr.ay
                piece_imgs[key] = (img.rotate(180), f2)
        out.append((key, xy))
    return out


# =========================================================================== build
def restore_transparency(path, alpha):
    """Palette dithering can leak a tiny alpha into pixels that were fully transparent (outside a piece's partition
    slice).  Map every such pixel back to a fully transparent palette entry so chained pieces never overlap."""
    im = Image.open(path)
    if im.mode != 'P':
        return
    trns = im.info.get('transparency')
    if not isinstance(trns, (bytes, bytearray)):
        return
    zero = [i for i, t in enumerate(trns) if t == 0]
    if not zero:
        return
    arr = np.array(im)
    arr[alpha == 0] = zero[0]
    out = Image.fromarray(arr, 'P')
    out.putpalette(im.getpalette())
    out.save(path, optimize=True, transparency=bytes(trns))


def build(only=None, no_scene=False):
    os.makedirs(CACHE, exist_ok=True)
    tex_imgs, tex_meta = {}, {}
    for k, (fn, cls, axis, notes) in TEXTURES.items():
        if only and k not in only:
            continue
        rgb = fn()
        tex_imgs[k] = F.to_rgb_image(rgb)
        avg = np.asarray(tex_imgs[k]).reshape(-1, 3).mean(0)
        tex_meta[k] = {'roadClass': cls, 'axis': axis, 'avgColour': '#%02X%02X%02X' % tuple(int(v) for v in avg),
                       'notes': notes + ' Pattern origin = grid origin G, scale 1; cell lines at a,b = 0 mod 128.'}
        print('texture %-18s %s' % (k, tex_meta[k]['avgColour']), flush=True)
    piece_imgs, piece_meta = {}, {}
    for key, fn, meta in piece_specs():
        if only and key not in only:
            continue
        img, fr = fn()
        piece_imgs[key] = (img, fr)
        piece_meta[key] = (meta, fr)
    print('pieces: %d' % len(piece_imgs), flush=True)
    if only:
        for k, im in tex_imgs.items():
            im.save(os.path.join(CACHE, k + '.png'))
        if piece_imgs:
            sheet_preview({}, piece_imgs, os.path.join(CACHE, 'only_pieces.png'))
        print('scratch ->', CACHE)
        return
    os.makedirs(OUT, exist_ok=True)
    for k, im in tex_imgs.items():
        F.save_png(im, os.path.join(OUT, k + '.png'), quant=256, dither=0.75)
    sheet, atlas = pack_utils.pack_atlas([(k, v[0]) for k, v in piece_imgs.items()], max_width=2048, trim=False,
                                         padding=2)
    F.save_png(sheet, os.path.join(OUT, ATLAS + '.png'), quant=256, dither=0.5)
    restore_transparency(os.path.join(OUT, ATLAS + '.png'), np.asarray(sheet)[..., 3])
    atlas['meta']['image'] = ATLAS + '.png'
    with open(os.path.join(OUT, ATLAS + '.json'), 'w', encoding='utf-8') as f:
        json.dump(atlas, f, separators=(',', ':'))
    man = manifest(tex_meta, piece_meta, atlas)
    with open(os.path.join(OUT, 'manifest.json'), 'w', encoding='utf-8') as f:
        json.dump(man, f, indent=1, ensure_ascii=False)
    tot = sum(os.path.getsize(os.path.join(OUT, f)) for f in os.listdir(OUT))
    print('atlas %s %dx%d; payload %.1f KB' % (ATLAS, sheet.size[0], sheet.size[1], tot / 1024), flush=True)
    # previews use the saved (quantised) files, i.e. exactly what the game loads
    tq = {k: Image.open(os.path.join(OUT, k + '.png')).convert('RGBA') for k in TEXTURES}
    sheet_q = Image.open(os.path.join(OUT, ATLAS + '.png')).convert('RGBA')
    pq = {}
    for k, (img, fr) in piece_imgs.items():
        r = atlas['frames'][k]['frame']
        pq[k] = (sheet_q.crop((r['x'], r['y'], r['x'] + r['w'], r['y'] + r['h'])), fr)
    sheet_preview(tq, pq, os.path.join(PREV, 'roads_sheet.png'))
    if not no_scene:
        scene(tq, pq, os.path.join(PREV, 'roads_scene.png'))
    print('previews -> docs/previews/roads_sheet.png%s' % ('' if no_scene else ', roads_scene.png'))


if __name__ == '__main__':
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[1])
    ap.add_argument('--only', help='comma separated keys -> scratch previews in tools/fx/_cache/roads/')
    ap.add_argument('--no-scene', action='store_true')
    a = ap.parse_args()
    build(set(a.only.split(',')) if a.only else None, a.no_scene)
