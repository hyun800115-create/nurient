"""
ui2_ground.py - v3 road + territory-fog art for Frost Village (CONTRACT_V3 §F).  Library module (no CLI),
imported by tools/fx/gen_ui2.py.  numpy + Pillow only, deterministic (fixed seeds).

  ground_road       512x512 texture, seamless in x AND y: rounded cobbles in packed snow.  Stones are laid
                    out in WORLD space (Worley cells on the iso-squashed plane: screen y counts double), so
                    every cobble is a 2:1 foreshortened stone like the plaza planks; joints are packed snow.
                    Lit by the shared upper-left sun (gen_ground.relief).
  road_edge         512x64 strip, seamless in x, alpha: irregular packed-snow border with a soft lit lip.
                    Road side = top half, snow side = bottom half, boundary line at y = 32.
  fog_bank          512x256, seamless in x, alpha: the drifting snow-fog / blizzard WALL.  Top rows are fully
                    opaque FOG_FILL (fill the hidden land beyond with that colour), puffy billow lip with a
                    cool underside near the bottom (the player's side) + a faint ground shadow.  It works
                    alone; for parallax it is the back layer of a 3-layer set:
  fog_bank_mid      512x192  band of billows hanging in front of the wall's lip (transparent top)
  fog_bank_front    512x128  drifting blowing-snow wisps + flakes (draw last, scroll fastest)
  fog_puff          128x128 particle: soft fog billow for the clearing moment (colours baked).
Rules kept from gen_ground.py: only periodic functions (fft_noise, worley_xy, wrapped distances), 2x/4x
supersampling and a wrap-aware downsample, so tiles have no seams.
"""
import math

import numpy as np
from PIL import Image

import fxlib as F
from fxlib import hexc
import gen_ground as GG

N = 512
WHITE = hexc('#FFFFFF')
FOG_FILL = '#E6EEF6'           # colour of the fully opaque top rows of fog_bank (fill the hidden land with it)
LXY = GG.LXY


# =========================================================================== x-periodic helpers
def blur_wrapx(a, sigma):
    """Gaussian blur that wraps in x and zero-pads in y (strips that tile horizontally only)."""
    if sigma <= 0:
        return a
    pad = int(math.ceil(sigma * 3)) + 1
    widths = [(pad, pad), (0, 0)] + [(0, 0)] * (a.ndim - 2)
    out = F.blur(np.pad(a.astype(np.float32), widths), sigma, wrap=True)
    return out[pad:-pad]


def down_wrapx(arr, ss):
    """Downsample an (H*ss, W*ss[, C]) array by ss, seamless in x (wrap-padded LANCZOS)."""
    if ss == 1:
        return arr
    pad = 4 * ss
    big = np.pad(arr, [(0, 0), (pad, pad)] + [(0, 0)] * (arr.ndim - 2), mode='wrap')
    src = big if big.ndim == 3 else big[..., None]
    oh, ow = big.shape[0] // ss, big.shape[1] // ss
    chans = [np.asarray(Image.fromarray(np.ascontiguousarray(src[..., i], np.float32), 'F').resize((ow, oh), Image.LANCZOS),
                        np.float32) for i in range(src.shape[2])]
    out = np.stack(chans, -1)[:, 4:-4]
    return out if arr.ndim == 3 else out[..., 0]


def premul_to_image(rgb_pm, a, ss):
    """Premultiplied supersampled RGB + alpha -> x-seamless PIL RGBA at 1/ss resolution."""
    arr = down_wrapx(np.dstack([rgb_pm, a]), ss)
    a2 = np.clip(arr[..., 3], 0, 1)
    with np.errstate(divide='ignore', invalid='ignore'):
        rgb = np.where(a2[..., None] > 1e-4, arr[..., :3] / np.maximum(a2[..., None], 1e-4), 0)
    return F.to_rgba_image(np.clip(rgb, 0, 1), a2)


def pnoise1(xs, W, seed, kmin, kmax, amp_fall=0.0):
    """Periodic 1-D noise (integer frequencies only), roughly unit amplitude."""
    r = np.random.default_rng(seed)
    out = np.zeros_like(xs, dtype=np.float32)
    for k in range(kmin, kmax + 1):
        out += np.sin(2 * math.pi * k * xs / W + r.uniform(0, 6.283)) * r.uniform(0.4, 1.0) / (k ** amp_fall)
    return out / max(1e-6, np.abs(out).max())


def xnoise(h, w, seed, scale, aniso=1.0):
    """2-D noise periodic in x (and y, harmless) on an h x w grid, unit std."""
    return F.fft_noise(h, w, seed, scale=scale, aniso=aniso, angle=0.0)


def wrap_dx(X, x0, W):
    return (X - x0 + W / 2) % W - W / 2


# =========================================================================== ground_road
def tex_road():
    """Packed-snow cobble road: chunky rounded stones (grey-blue + a few warm ones) bedded in packed snow,
    snow drifted into the joints, light frost on the stone tops and a few patches where packed snow
    covers the cobbles.  Seamless 512 (Worley on the iso plane: 512 x 1024 torus in (x, 2y))."""
    ss = 2
    X, Y = GG.coords(N, ss)
    Xi, Yi = X, Y * 2.0                                       # iso plane: world circles -> 2:1 ellipses
    F1, F2, ID = GG.worley_xy(Xi, Yi, N, 2 * N, 14, seed=611, jitter=0.78)
    k = 14 * 28
    rng = np.random.default_rng(612)
    edge = (F2 - F1) * 0.5                                    # distance to the cell border (iso units)
    gap = 2.8 + 1.4 * rng.uniform(0, 1, k).astype(np.float32)[ID]
    d = gap - edge                                            # <0 inside the stone
    d = np.maximum(d, F1 - 17.0)                              # round off long corners
    d = F.blur(d, 1.6 * ss, wrap=True)                        # soften polygon corners -> cobbles
    cov = np.clip(0.5 - d / 1.4, 0, 1)
    dome = np.clip(-d / 10.0, 0, 1)
    hgt = (1 - (1 - dome) ** 2) * 9.0                         # rounded dome profile
    lit = GG.relief(F.blur(hgt, 0.8 * ss, wrap=True), ss, 0.75)
    tone = rng.uniform(0, 1, k).astype(np.float32)[ID]
    warm = (rng.random(k) < 0.22)[ID]
    dark = (rng.random(k) < 0.18)[ID]
    col = F.mix(hexc('#97A2B3'), hexc('#B9C2CF'), tone)
    col = np.where(warm[..., None], F.mix(hexc('#B0A296'), hexc('#C8B9AA'), tone), col)
    col = np.where(dark[..., None], F.mix(hexc('#808A9C'), hexc('#959EAE'), tone), col)
    mott = F.fft_noise(N * ss, N * ss, 613, scale=5.0 * ss)
    col = GG.lerp3(col, hexc('#7C8596'), np.clip(-mott - 0.8, 0, 1) * 0.3)
    col = GG.lerp3(col, hexc('#F4F7FB'), np.clip(lit, 0, 1) * 0.85)
    col = GG.lerp3(col, hexc('#4E5A72'), np.clip(-lit, 0, 1) * 0.6)
    # soft sky highlight on the upper-left shoulder of every stone
    sp = np.clip(lit - 0.35, 0, 1) * dome
    col = GG.lerp3(col, WHITE, np.clip(sp * 1.2, 0, 1) * 0.6)
    # joints: packed snow with a cool shade right next to the stones (AO)
    jn = F.fft_noise(N * ss, N * ss, 615, scale=8.0 * ss)
    joint = F.mix(hexc('#D8E2EE'), hexc('#EAF0F7'), np.clip(0.5 + jn * 0.35, 0, 1))
    ao = np.clip(1 - (d - 0.3) / 3.5, 0, 1) * (d > 0)
    joint = GG.lerp3(joint, hexc('#A3B3C9'), ao * 0.6)
    rgb = GG.lerp3(joint, col, cov)
    # soft cast shadow of each stone onto the joint (sun upper-left -> shadow lower-right)
    sh = F.blur(np.roll(np.roll(cov, int(1.5 * ss), 0), int(2 * ss), 1), 0.8 * ss, wrap=True)
    rgb = GG.lerp3(rgb, hexc('#93A4BC'), np.clip(sh - cov, 0, 1) * 0.4)
    # patches of packed snow covering the cobbles (big soft drifts with a lit / shaded rim)
    low = F.fft_noise(N * ss, N * ss, 616, scale=40 * ss)
    det = F.fft_noise(N * ss, N * ss, 617, scale=9 * ss)
    patch = np.clip((low + det * 0.22 - 1.05) * 2.6, 0, 1)
    patch = F.blur(patch, 1.2 * ss, wrap=True)
    ph = F.blur(patch, 3.0 * ss, wrap=True) * 5.0
    plit = GG.relief(ph, ss, 1.0)
    snow = F.mix(hexc('#E8EEF6'), hexc('#F5F8FC'), np.clip(0.5 + det * 0.3, 0, 1))
    snow = GG.lerp3(snow, WHITE, np.clip(plit, 0, 1) * 0.8)
    snow = GG.lerp3(snow, hexc('#B4C4DA'), np.clip(-plit, 0, 1) * 0.8)
    rgb = GG.lerp3(rgb, snow, np.clip(patch * 1.15, 0, 1))
    # scattered snow crumbs + grit
    cr = F.fft_noise(N * ss, N * ss, 618, scale=1.3 * ss)
    rgb = GG.lerp3(rgb, hexc('#F7FAFD'), np.clip((cr - 2.5) * 1.3, 0, 1) * 0.8)
    rgb = GG.lerp3(rgb, hexc('#6E6A6A'), np.clip((-cr - 2.5) * 1.2, 0, 1) * 0.5 * (1 - cov))
    return GG.finish(rgb, ss)


# =========================================================================== road_edge
def road_edge(W=512, H=64):
    """Packed-snow border strip (seamless in x).  Road side above (transparent with a few snow crumbs),
    an irregular wavy snow lip right on the boundary (y = 32), snow side below fading out softly so
    it melts into ground_snow.  Shading is mild so the strip may be flipped / rotated."""
    ss = 4
    xs = (np.arange(W * ss, dtype=np.float32) + 0.5) / ss
    ys = (np.arange(H * ss, dtype=np.float32) + 0.5) / ss
    X, Y = np.meshgrid(xs, ys)
    wave = 32 + 3.2 * pnoise1(xs, W, 701, 2, 9, 0.5) + 1.3 * pnoise1(xs, W, 702, 10, 28, 0.3)
    tongues = np.clip(pnoise1(xs, W, 703, 3, 14, 0.2), 0, 1) ** 1.5 * 6.0       # snow tongues onto the road
    lip_y = wave - tongues
    dist = Y - lip_y[None, :]                                   # <0 road side, >0 snow side
    # snow body: alpha 1 just below the lip, fading toward the bottom (blends into ground_snow)
    body = np.clip(0.5 + dist * 1.2, 0, 1) * np.clip((H - 2 - Y) / (H - 2 - lip_y[None, :] - 6), 0, 1) ** 0.8
    # mound height (soft rounded lip) for shading
    hgt = np.exp(-((dist - 3.5) / 4.0) ** 2) * 3.2 + np.clip(dist, 0, 8) * 0.12
    gy = np.gradient(hgt, 1.0 / ss, axis=0)
    gx = (np.roll(hgt, -1, 1) - np.roll(hgt, 1, 1)) * 0.5 * ss
    s = -(gx * LXY[0] + gy * LXY[1]) * 0.7
    col = np.broadcast_to(hexc('#F4F7FB'), X.shape + (3,)).copy()
    col = F.mix(col, WHITE, np.clip(s, 0, 1) * 0.9)
    col = F.mix(col, hexc('#BDCBDE'), np.clip(-s, 0, 1) * 0.9)
    # thin cool contact line where the snow meets the road (reads as a raised edge)
    contact = np.exp(-((dist + 0.4) / 0.9) ** 2)
    col = F.mix(col, hexc('#AFC0D6'), contact * 0.6)
    a = np.maximum(body, contact * 0.75 * (dist > -2))
    # snow crumbs scattered on the road side
    rng = np.random.default_rng(704)
    crumbs = np.zeros_like(X)
    for i in range(70):
        bx = rng.uniform(0, W)
        by = np.interp(bx, xs, lip_y) - rng.uniform(1.5, 18) ** 1.0
        r = rng.uniform(0.7, 2.2)
        dd = np.hypot(wrap_dx(X, bx, W), (Y - by) * 1.6) - r
        crumbs = np.maximum(crumbs, np.clip(0.5 - dd * 1.5, 0, 1) * rng.uniform(0.6, 1.0))
    ccol = F.mix(hexc('#F7FAFD'), hexc('#C9D6E8'), np.clip((Y - (lip_y[None, :] - 20)) / 30, 0, 1) * 0.0)
    col = col * (1 - crumbs[..., None] * (1 - a[..., None])) + ccol * (crumbs * (1 - a))[..., None]
    a = np.maximum(a, crumbs)
    # gentle texture in the snow
    nz = xnoise(H * ss, W * ss, 705, 3 * ss)
    col = F.mix(col, hexc('#E3EAF4'), np.clip(nz - 1.0, 0, 1) * 0.5)
    pm = col * a[..., None]
    return premul_to_image(pm, a, ss)


# =========================================================================== fog
def _smin(a, b, k):
    h = np.clip(0.5 + 0.5 * (b - a) / k, 0, 1)
    return b + (a - b) * h - k * h * (1 - h)


def _grid(W, H, ss):
    xs = (np.arange(W * ss, dtype=np.float32) + 0.5) / ss
    ys = (np.arange(H * ss, dtype=np.float32) + 0.5) / ss
    X, Y = np.meshgrid(xs, ys)
    return xs, X, Y


def _billow_row(X, Y, W, rng, y, n, rmin, rmax, jit=0.25, ysq=1.12):
    """Wrapped billow circles along a row -> list of (bx, by, r) and their smooth-union SDF."""
    d = None
    blobs = []
    off = rng.uniform(0, W / n)
    for i in range(n):
        bx = (off + i * W / n + rng.uniform(-jit, jit) * W / n) % W
        r = rng.uniform(rmin, rmax)
        by = y + rng.uniform(-0.18, 0.18) * r
        blobs.append((bx, by, r))
        e = np.hypot(wrap_dx(X, bx, W), (Y - by) * ysq) - r
        d = e if d is None else _smin(d, e, r * 0.3)
    return d, blobs


def billow_layer(W, H, ss, seed, lip, n, rmin, rmax, cols, inner_rows=3, top_fade=None, core_alpha=1.0,
                 fill=FOG_FILL, ground_shadow=0.22, wobble=2.0, feather=2.2):
    """One fog layer, seamless in x.  The lower edge is a row of soft billows (circle centres ~ `lip`);
    everything above it is solid fog (no holes).  Inner billow rows only shape the shading, so the wall
    looks puffy and volumetric.  Colours: cols = (light, mid, shade), lit by the shared upper-left sun.
    top_fade (px) makes the top transparent (for a band that hangs in front of the wall); otherwise
    the top blends into the flat `fill` colour (continue the hidden area with a solid rect of it).
    Returns premultiplied rgb (H*ss, W*ss, 3) and alpha."""
    rng = np.random.default_rng(seed)
    xs, X, Y = _grid(W, H, ss)
    d, blobs = _billow_row(X, Y, W, rng, lip, n, rmin, rmax)
    d = _smin(d, Y - (lip - rmax * 0.25), rmax * 0.35)                 # solid above the billow centres
    nz = xnoise(H * ss, W * ss, seed + 1, 6 * ss)
    d = d + nz * wobble
    cov = np.clip(0.5 - d / feather, 0, 1)
    cov = blur_wrapx(cov, 0.8 * ss)
    # height field: lip billows + inner rows (shading only)
    hgt = blur_wrapx(cov, 7 * ss) * 12.0
    for j in range(1, inner_rows + 1):
        dj, _ = _billow_row(X, Y, W, rng, lip - j * rmax * 0.95, max(3, n - j), rmin * (1 + 0.15 * j),
                            rmax * (1 + 0.15 * j))
        cj = np.clip(0.5 - dj / 3.0, 0, 1)
        hgt += blur_wrapx(cj, (5 + 2 * j) * ss) * (10.0 - 1.8 * j)
    hgt += xnoise(H * ss, W * ss, seed + 3, 14 * ss, aniso=3.0) * 1.2
    gy = np.gradient(hgt, 1.0 / ss, axis=0)
    gx = (np.roll(hgt, -1, 1) - np.roll(hgt, 1, 1)) * 0.5 * ss
    s = -(gx * LXY[0] + gy * LXY[1]) * 0.45
    light, mid, shade = (hexc(c) for c in cols)
    col = np.broadcast_to(mid, X.shape + (3,)).copy()
    col = F.mix(col, light, np.clip(s, 0, 1) * 0.9)
    col = F.mix(col, shade, np.clip(-s, 0, 1) * 0.9)
    # cool underside of the lip billows (separates the fog from white snow)
    under = np.clip((Y - lip) / (rmax * 0.9), 0, 1) * cov
    col = F.mix(col, shade, under * 0.55)
    # drifting streaks inside the wall
    wisp = xnoise(H * ss, W * ss, seed + 2, 8 * ss, aniso=6.0)
    col = F.mix(col, light, np.clip(wisp - 0.5, 0, 1) * 0.3)
    a = cov * core_alpha
    if top_fade:
        a = a * F.smoothstep(0.0, top_fade, Y)
    else:
        topt = 1 - F.smoothstep(0.0, lip - rmax * 2.2, Y)
        col = F.mix(col, hexc(fill), topt)
        a = np.maximum(a, topt)
    pm = col * a[..., None]
    # soft cool shadow on the ground right below the lip (helps the wall sit on the snow)
    if ground_shadow:
        dist = np.clip(d, 0, None)
        gs = np.exp(-(dist / 9.0) ** 2) * (d > 0) * ground_shadow * (Y > lip - rmax)
        gs = blur_wrapx(gs, 2.0 * ss)
        pm = pm + hexc('#8EA3C2') * (gs * (1 - a))[..., None]
        a = a + gs * (1 - a)
    a = a * np.clip((H - 1 - Y) / 4.0, 0, 1)
    pm = pm * np.clip((H - 1 - Y) / 4.0, 0, 1)[..., None]
    return pm, a


def fog_ball(c, x, y, r, W, top='#FFFFFF', bot='#E2EAF4', lo='#8FA6C6', rim='#A9BCD8', haze=0.0,
             haze_col=FOG_FILL, a=1.0, feather=0.9):
    """Sphere-lit cotton ball (like gen_fx.ball, softer edge), drawn wrapped in x on a W-wide canvas.
    haze blends the ball toward the fog fill colour (aerial perspective for the rows further back)."""
    for ox in (-W, 0, W):
        xx = x + ox
        if xx + r + 4 < 0 or xx - r - 4 > W:
            continue
        R = c.region(xx - r - 4, y - r - 4, xx + r + 4, y + r + 4)
        if R.empty:
            continue
        d = F.sd_circle(R.X, R.Y, xx, y, r)
        rim_c = F.mix(hexc(rim), hexc(haze_col), haze)
        R.fill(d - max(0.8, r * 0.05), rim_c, a, feather=feather)
        nx = (R.X - xx) / r
        ny = (R.Y - y) / r
        nz = np.sqrt(np.clip(1 - nx * nx - ny * ny, 0.0, 1.0))
        n = np.dstack([nx, ny, nz]).astype(np.float32)
        n /= np.maximum(np.linalg.norm(n, axis=2, keepdims=True), 1e-6)
        t = np.clip((R.Y - (y - r)) / (2 * r), 0, 1)
        col = F.shade(F.mix(hexc(top), hexc(bot), t), F.lambert(n), 0.5, 0.6, hexc(lo))
        col = F.mix(col, hexc(haze_col), haze)
        R.paint(R.cov(d, feather), col, a)


def cloud_row(c, W, rng, y, n, rmin, rmax, haze=0.0, a=1.0, top='#FFFFFF', bot='#DCE6F1', lo='#8FA6C6',
              rim='#A3B7D2', rim_a=0.45, feather=1.2, puff=0.55):
    """One horizontal bank of merged billows (smooth union of wrapped circles), seamless in x.
    Pillow shading (blurred coverage as height, wrap-aware) lit from the upper-left sun, cool lower part,
    soft cool rim only on the bank's silhouette.  haze pulls it toward FOG_FILL (rows further back)."""
    R = c.region(0, y - rmax * 2.2, W, y + rmax * 1.5)
    if R.empty:
        return
    seed = int(rng.integers(1 << 30))
    wave = lambda xx: 0.28 * rmax * pnoise1(np.atleast_1d(np.asarray(xx, np.float32)), W, seed, 1, 3)
    wv = wave(R.X[0])[None, :]                               # the bank meanders gently along x
    off = rng.uniform(0, W / n)
    d = None
    for i in range(n):
        bx = (off + i * W / n + rng.uniform(-0.22, 0.22) * W / n) % W
        r = rng.uniform(rmin, rmax)
        if rng.random() < 0.22:                              # a few big billows tower above the bank
            r *= 1.45
        by = y + float(wave(bx)[0]) + rng.uniform(-0.2, 0.2) * r - (r - rmin) * 0.35
        e = np.hypot(wrap_dx(R.X, bx, W), (R.Y - by) * 1.08) - r
        d = e if d is None else _smin(d, e, r * 0.4)
    band = np.abs(R.Y - y - wv) - rmin * 0.5                 # continuous body: no holes between billows
    d = _smin(d, band, rmin * 0.35)
    ss = c.ss
    cov = R.cov(d, feather)
    h = blur_wrapx(cov, rmax * puff * ss) * rmax * 0.9
    gy = np.gradient(h, 1.0 / ss, axis=0)
    gx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * 0.5 * ss
    nrm = np.dstack([-gx, -gy, np.ones_like(gx)])
    nrm /= np.linalg.norm(nrm, axis=2, keepdims=True)
    t = np.clip((R.Y - (y - rmax)) / (2.2 * rmax), 0, 1)
    col = F.shade(F.mix(hexc(top), hexc(bot), t), F.lambert(nrm), 0.55, 0.7, hexc(lo))
    col = F.mix(col, hexc(FOG_FILL), haze)
    rim_c = F.mix(hexc(rim), hexc(FOG_FILL), haze)
    R.fill(d - 1.0, rim_c, a * rim_a * (1 - haze * 0.6), feather=feather + 0.6)
    R.paint(cov, col, a)


def _rows(c, W, rng, rows, haze_back=0.7, alpha_back=1.0):
    """rows = [(y, n, rmin, rmax), ...] from back (top) to front (bottom)."""
    k = len(rows)
    for j, (y, n, rmin, rmax) in enumerate(rows):
        depth = 1 - j / max(1, k - 1)                   # 1 = back row, 0 = front (lip) row
        cloud_row(c, W, rng, y, n, rmin, rmax, haze=haze_back * depth ** 1.2,
                  a=alpha_back + (1 - alpha_back) * (1 - depth))


def _ground_shadow(c, W, ss, strength, lip_y, reach=16.0):
    """Soft cool shadow on the ground just below the fog's lowest edge (sun from the upper left)."""
    a = c.a.copy()
    below = np.roll(np.clip(F.shift(a, 0, 5 * ss), 0, 1), 3 * ss, axis=1)      # wrap in x
    sh = blur_wrapx(below, 5 * ss) * (1 - a)
    sh *= (c.Y > lip_y)
    pm = hexc('#8EA3C2') * (sh * strength)[..., None]
    c.rgb += pm * (1 - c.a[..., None]) / 1.0
    c.a += sh * strength * (1 - c.a)


def fog_bank(W=512, H=256):
    """The fog WALL (works alone; back layer of the parallax set).  Fully opaque FOG_FILL at the top,
    5 overlapping rows of soft cotton-ball billows (back rows hazed into the fill = depth), a scalloped
    lip with cool undersides at y ~ 190-225, and a faint cool ground shadow below it."""
    ss = 2
    c = F.Canvas(W, H, ss=ss)
    rng = np.random.default_rng(801)
    c.paint(np.clip((186 - c.Y) * ss, 0, 1).astype(np.float32), hexc(FOG_FILL))       # solid core (no holes)
    rows = [(76, 10, 26, 36), (114, 11, 24, 33), (152, 12, 22, 31), (188, 14, 19, 28)]
    _rows(c, W, rng, rows, haze_back=0.75)
    c.paint(np.clip(1 - c.Y / 64.0, 0, 1).astype(np.float32) ** 1.6, hexc(FOG_FILL))   # melt into the fill
    _ground_shadow(c, W, ss, 0.32, 190)
    fade = np.clip((H - 1 - c.Y) / 4.0, 0, 1)
    return premul_to_image(c.rgb * fade[..., None], c.a * fade, ss)


def fog_bank_mid(W=512, H=192):
    """Mid layer: a band of billows that hangs in front of the wall's lip (top row semi-transparent,
    transparent above it).  Draw over fog_bank ~50 px lower, scroll ~2x faster."""
    ss = 2
    c = F.Canvas(W, H, ss=ss)
    rng = np.random.default_rng(811)
    rows = [(96, 11, 20, 29), (128, 13, 17, 25)]
    _rows(c, W, rng, rows, haze_back=0.3)
    _ground_shadow(c, W, ss, 0.26, 130)
    fade = np.clip((H - 1 - c.Y) / 4.0, 0, 1) * np.clip(c.Y / 6.0, 0, 1)
    return premul_to_image(c.rgb * fade[..., None], c.a * fade, ss)


def fog_bank_front(W=512, H=128):
    """Front layer: drifting blowing-snow wisps (soft stretched puffs with a cool underside) + flakes.
    Low/medium alpha; draw last, scroll fastest (~3-4x the wall)."""
    ss = 2
    rng = np.random.default_rng(821)
    xs, X, Y = _grid(W, H, ss)
    d = None
    for i in range(7):
        bx = (i + rng.uniform(-0.3, 0.3)) * W / 7
        by = H * rng.uniform(0.38, 0.62)
        rx, ry = rng.uniform(38, 64), rng.uniform(8, 13)
        e = (np.hypot(wrap_dx(X, bx, W) / rx, (Y - by) / ry) - 1.0) * ry
        d = e if d is None else _smin(d, e, 5.0)
    d = d + xnoise(H * ss, W * ss, 822, 4 * ss, aniso=4.0) * 3.0
    cov = np.clip(0.5 - d / 6.0, 0, 1)
    cov = blur_wrapx(cov, 2.5 * ss)
    hgt = blur_wrapx(cov, 5 * ss) * 8.0
    gy = np.gradient(hgt, 1.0 / ss, axis=0)
    gx = (np.roll(hgt, -1, 1) - np.roll(hgt, 1, 1)) * 0.5 * ss
    s = -(gx * LXY[0] + gy * LXY[1]) * 0.6
    col = np.broadcast_to(hexc('#F2F6FB'), X.shape + (3,)).copy()
    col = F.mix(col, WHITE, np.clip(s, 0, 1))
    col = F.mix(col, hexc('#A9BDD6'), np.clip(-s, 0, 1) * 0.9)
    streak = xnoise(H * ss, W * ss, 823, 3 * ss, aniso=8.0)
    a = cov * (0.62 + 0.25 * np.clip(streak, -1, 1))
    # flakes (wrapped, slightly streaked by the wind) with a thin cool rim
    fl = np.zeros_like(X)
    rim = np.zeros_like(X)
    for i in range(46):
        bx, by = rng.uniform(0, W), rng.uniform(H * 0.12, H * 0.88)
        r = rng.uniform(1.0, 2.3)
        dd = np.hypot(wrap_dx(X, bx, W) / 1.8, Y - by) - r * 0.7
        fl = np.maximum(fl, np.clip(0.5 - dd * 1.3, 0, 1))
        rim = np.maximum(rim, np.clip(0.5 - (dd - 0.8) * 1.3, 0, 1))
    pm = col * a[..., None]
    rr = np.clip(rim - fl, 0, 1) * 0.6 * (1 - a)
    pm = pm + hexc('#8EA3C2') * rr[..., None]
    a = a + rr
    pm = pm * (1 - fl[..., None]) + WHITE * fl[..., None]
    a = a * (1 - fl) + fl
    fade = np.clip(Y / 6.0, 0, 1) * np.clip((H - 1 - Y) / 6.0, 0, 1)
    return premul_to_image(pm * fade[..., None], a * fade, ss)


def fog_puff(S=128):
    """Soft fog billow particle (baked light blue-white, feathered rim, pillow shading)."""
    import gen_fx as GF
    c = F.Canvas(S, S, ss=2)
    k = S / 128
    blobs = [(52, 72, 28), (80, 68, 24), (64, 50, 26), (40, 56, 18), (90, 52, 15), (66, 80, 22)]
    d = GF.puff_sdf(c, [(x * k, y * k, r * k) for x, y, r in blobs], 12 * k)
    L = c.layer()
    GF.cloud(L, d, '#FFFFFF', '#E3EBF5', '#9FB4D0', bevel=18 * k, rim='#B7C7DC', rim_a=0.6)
    c.over(L, 0.92, mask=GF.soft_mask(c, d, 9 * k))
    return c.image()


GROUND = {
    'ground_road': tex_road,
}
STRIPS = {
    'road_edge': road_edge,
    'fog_bank': fog_bank,
    'fog_bank_mid': fog_bank_mid,
    'fog_bank_front': fog_bank_front,
}
