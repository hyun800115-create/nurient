"""
tf_layerfx.py - per-layer post-processing for the townfolk paper-doll layers (pure numpy).

Shared by tf_pack.py (atlas build) and tf_proof.py (layering proof).

ring_layer(img, mask)
    The base cast gets ONE soft 1px ink outline around the whole character
    (char_pack.ink_outline).  A paper-doll has no single silhouette at bake time, so every
    layer gets its own outline ring and the ring is erased wherever it falls inside the
    MANNEQUIN silhouette (body: core + limbs + head of that exact frame; head-space: the head
    ellipsoid).  Rings that would separate two pieces of one body (hair over forehead, coat
    over arm, coat hem over trousers) therefore vanish and what remains is ~the outline of
    the whole composite.  Ring colour = 70% ink + 30% the layer's own shade, exactly like
    ink_outline; because the ring is part of the (tinted) layer it is tinted with it.
sheen layers -> townfolk_compose.sheen_alpha (white + alpha).
"""
import numpy as np

INK = np.array((52, 40, 48), np.float32) / 255.0


def _shift(a, dy, dx):
    out = np.zeros_like(a)
    h, w = a.shape[:2]
    ys = slice(max(0, dy), h + min(0, dy))
    yd = slice(max(0, -dy), h + min(0, -dy))
    xs = slice(max(0, dx), w + min(0, dx))
    xd = slice(max(0, -dx), w + min(0, -dx))
    out[ys, xs] = a[yd, xd]
    return out


def ring_layer(img, mask=None, strength=0.85, mix=0.70, ink=INK):
    """img: float32 (H, W, 4) straight alpha 0..1.  mask: float32 (H, W) 0..1 (ring erased where 1)."""
    al = img[..., 3]
    rgb = img[..., :3]
    orth = np.max(np.stack([_shift(al, dy, dx) for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1))]), 0)
    diag = np.max(np.stack([_shift(al, dy, dx) for dy, dx in ((-1, -1), (-1, 1), (1, -1), (1, 1))]), 0)
    ring = np.clip(np.maximum(orth, diag * 0.6), 0, 1) * strength * (1 - al)
    if mask is not None:
        ring = ring * (1 - np.clip(mask, 0, 1))
    prem = rgb * al[..., None]
    s = sum(_shift(prem, dy, dx) for dy in (-1, 0, 1) for dx in (-1, 0, 1))
    sa = sum(_shift(al, dy, dx) for dy in (-1, 0, 1) for dx in (-1, 0, 1))
    avg = s / np.maximum(sa, 1e-4)[..., None]
    line = avg * (1 - mix) + ink * mix
    out_a = al + ring
    out_rgb = (prem + line * ring[..., None]) / np.maximum(out_a, 1e-4)[..., None]
    res = np.concatenate([out_rgb, out_a[..., None]], -1)
    res[out_a < 1.5 / 255.0] = 0
    return np.clip(res, 0, 1).astype(np.float32)


def layer_kind(name):
    """'face' | 'sheen' | 'mask' | 'layer' for a cache layer name."""
    if name.endswith('.sheen'):
        return 'sheen'
    if name.startswith('face.') or name.startswith('brow.'):
        return 'face'
    if name == 'mask':
        return 'mask'
    return 'layer'
