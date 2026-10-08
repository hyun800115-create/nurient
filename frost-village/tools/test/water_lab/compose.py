#!/usr/bin/env python3
"""Compose lab captures (used by tools/test/water_lab.mjs).
  compose.py pair  <left.png> <right.png> <out.png> <left label> <right label>
  compose.py strip <out.png> <cols> <f1.png> ... <fn.png> <label1> ... <labeln>
"""
import sys
from PIL import Image, ImageDraw


def label(im, text, xy):
    d = ImageDraw.Draw(im)
    x, y = xy
    w = int(d.textlength(text)) + 12
    d.rectangle([x, y, x + w, y + 18], fill=(20, 28, 44))
    d.text((x + 6, y + 3), text, fill=(240, 244, 250))


def pair(a, b, out, la, lb, crop=None):
    A, B = Image.open(a).convert('RGB'), Image.open(b).convert('RGB')
    if crop:
        box = tuple(int(v) for v in crop.split(','))
        A, B = A.crop(box), B.crop(box)
    gap = 12
    im = Image.new('RGB', (A.width + B.width + gap, max(A.height, B.height) + 28), (20, 28, 44))
    im.paste(A, (0, 28))
    im.paste(B, (A.width + gap, 28))
    label(im, la, (4, 4))
    label(im, lb, (A.width + gap + 4, 4))
    im.save(out, optimize=True)


def strip(out, cols, rest):
    n = len(rest) // 2
    files, labels = rest[:n], rest[n:]
    ims = [Image.open(f).convert('RGB') for f in files]
    w, h = ims[0].size
    cols = min(cols, n)
    rows = (n + cols - 1) // cols
    g = 8
    im = Image.new('RGB', (cols * w + (cols - 1) * g, rows * h + (rows - 1) * g), (20, 28, 44))
    for i, (f, lab) in enumerate(zip(ims, labels)):
        x, y = (i % cols) * (w + g), (i // cols) * (h + g)
        im.paste(f, (x, y))
        label(im, lab, (x + 4, y + 4))
    im.save(out, optimize=True)


if __name__ == '__main__':
    if sys.argv[1] == 'pair':
        pair(*sys.argv[2:8])
    elif sys.argv[1] == 'strip':
        strip(sys.argv[2], int(sys.argv[3]), sys.argv[4:])
