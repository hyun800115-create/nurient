"""
wkr_preview.py - previews for the v4 worker work + the chief's dog-play anims (python3 + Pillow).

    python3 tools/blender/wkr_preview.py --identity --before <dir with the OLD char_player.png/.json> [--sheet out.png]
        decode every frame of the old and the new chief atlas and compare pixels (proves the
        existing anims did not change when pet/give/throw were added)
    python3 tools/blender/wkr_preview.py --newanims [--cache /tmp/fv_cache/characters] [--out PATH.gif]
        chief pet / give / throw in S, SE, E, NE, N with the dog (assets/pets2 pet_dog if it exists,
        else assets/villagers) standing at characters.player.petPoint facing the chief, the treat
        hand-over and the ball released at impactPoint -> docs/previews/char_player_newanims.gif
        (+ a still contact sheet char_player_newanims.png)

The dog is composited exactly like the game should do it: dog anchor = chief anchor +
petPoint[dir] (dx negated for mirrored dirs), dog faces the chief (opposite dir), depth
order by anchor y.
"""
import json
import os
import sys

from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.dirname(os.path.dirname(HERE))
ASSETS = os.path.join(GAME, 'assets')
PREV = os.path.join(GAME, 'docs', 'previews')
sys.path.insert(0, HERE)
import char_pack  # noqa: E402

BG = (201, 214, 232, 255)
GROUND = (232, 238, 246, 255)
LABEL = (43, 47, 58, 255)
OPP = {'S': 'N', 'SE': 'NW', 'E': 'W', 'NE': 'SW', 'N': 'S', 'SW': 'NE', 'W': 'E', 'NW': 'SE'}
MIRROR = {'SW': 'SE', 'W': 'E', 'NW': 'NE'}


class Atlas:
    """Full-frame access to a Phaser JSON-hash atlas (rebuilds the untrimmed frame)."""

    def __init__(self, png, js):
        self.sheet = Image.open(png).convert('RGBA')
        with open(js) as f:
            self.frames = json.load(f)['frames']

    def has(self, name):
        return name in self.frames

    def get(self, name):
        fr = self.frames[name]
        f, ss, src = fr['frame'], fr['spriteSourceSize'], fr['sourceSize']
        full = Image.new('RGBA', (src['w'], src['h']), (0, 0, 0, 0))
        full.paste(self.sheet.crop((f['x'], f['y'], f['x'] + f['w'], f['y'] + f['h'])), (ss['x'], ss['y']))
        return full


def load_char(frag, key):
    with open(os.path.join(ASSETS, frag, 'manifest.json')) as f:
        man = json.load(f)
    ch = man['characters'][key]
    a = next(x for x in man['atlases'] if x['key'] == ch['atlas'])
    return ch, Atlas(os.path.join(ASSETS, a['png']), os.path.join(ASSETS, a['json']))


def dog():
    for frag in ('pets2', 'villagers'):
        p = os.path.join(ASSETS, frag, 'manifest.json')
        if os.path.exists(p):
            try:
                return load_char(frag, 'pet_dog')
            except (KeyError, StopIteration):
                continue
    return None, None


def frame_of(atlas, ch, anim, d, i):
    """Frame image for a possibly mirrored direction, falling back to idle."""
    src = MIRROR.get(d, d)
    a = anim if anim in ch['anims'] and src in ch['anims'][anim].get('dirs', ch['dirs']) else 'idle'
    n = ch['anims'][a]['frames']
    name = ch['frameName'].format(anim=a, dir=src, i=i % n)
    im = atlas.get(name) if atlas.has(name) else Image.new('RGBA', (128, 128))
    return im.transpose(Image.FLIP_LEFT_RIGHT) if d in MIRROR else im


def newanims(cache, out_gif, out_png):
    man_p = os.path.join(ASSETS, 'characters', 'manifest.json')
    with open(man_p) as f:
        pm = json.load(f)['characters']['player']
    dch, datlas = dog()

    def chief(anim, d, i):
        p = os.path.join(cache, 'player', f'{anim}_{d}_{i}.png')
        return char_pack.ink_outline(Image.open(p))
    meta_p = os.path.join(cache, 'player', 'meta.json')
    with open(meta_p) as f:
        meta = json.load(f)
    pet_pt = meta.get('petPoint', {})
    dirs = ['S', 'SE', 'E', 'NE', 'N']
    anims = [('pet', 'idle'), ('give', 'happy'), ('throw', None)]
    cw, chh = 150, 150
    ax, ay = 75, 112
    frames = []
    stills = []
    for anim, dog_anim in anims:
        info = meta['anims'][anim]
        n = info['frames']
        reps = 2 if anim == 'pet' else 1
        for rep in range(reps):
            for i in range(n):
                canvas = Image.new('RGBA', (len(dirs) * cw, chh + 18), BG)
                dr = ImageDraw.Draw(canvas)
                dr.rectangle([0, chh - 46, canvas.width, canvas.height], fill=GROUND)
                dr.text((6, chh + 3), f'chief {anim}  frame {i}/{n}' +
                        (f'  impactFrame {info.get("impactFrame")}' if 'impactFrame' in info else ''), fill=LABEL)
                for c, d in enumerate(dirs):
                    cell = Image.new('RGBA', (cw, chh), (0, 0, 0, 0))
                    sh = ImageDraw.Draw(cell)
                    sh.ellipse([ax - 23, ay - 9, ax + 23, ay + 9], fill=(90, 110, 140, 70))
                    layers = [(0, chief(anim, d, i), (ax - 64, ay - 104))]
                    if dog_anim and dch and d in pet_pt:
                        dx, dy = pet_pt[d]
                        dd = OPP[d]
                        da = 'idle' if MIRROR.get(dd, dd) not in dch['anims'].get(dog_anim, {}).get(
                            'dirs', dch['dirs']) else dog_anim
                        if anim == 'give' and i < info['impactFrame']:
                            da = 'idle'
                        dimg = frame_of(datlas, dch, da, dd, i)
                        sh.ellipse([ax + dx - 20, ay + dy - 8, ax + dx + 20, ay + dy + 8], fill=(90, 110, 140, 60))
                        layers.append((dy, dimg, (ax + dx - 64, ay + dy - 104)))
                    for _, im, pos in sorted(layers, key=lambda t: t[0]):
                        cell.alpha_composite(im, pos)
                    ip = info.get('impactPoint', {}).get(d)
                    if ip and i == info.get('impactFrame'):
                        x, y = ax + ip[0], ay + ip[1]
                        sh.line([x - 4, y, x + 4, y], fill=(255, 200, 61, 255), width=2)
                        sh.line([x, y - 4, x, y + 4], fill=(255, 200, 61, 255), width=2)
                    canvas.alpha_composite(cell, (c * cw, 0))
                frames.append((canvas, int(1000 / info['fps'])))
                if rep == 0:
                    stills.append(canvas)
    big = [f.resize((f.width * 3 // 2, f.height * 3 // 2), Image.LANCZOS).convert('RGB') for f, _ in frames]
    pal = big[0].quantize(colors=200, method=Image.Quantize.MEDIANCUT)
    q = [f.quantize(palette=pal, dither=Image.Dither.NONE) for f in big]
    q[0].save(out_gif, save_all=True, append_images=q[1:], duration=[d for _, d in frames], loop=0,
              optimize=True, disposal=1)
    sheet = Image.new('RGBA', (stills[0].width, sum(s.height for s in stills)), BG)
    y = 0
    for s in stills:
        sheet.alpha_composite(s, (0, y))
        y += s.height
    sheet.convert('RGB').save(out_png, optimize=True)
    print('wrote', out_gif, len(frames), 'frames;', out_png, sheet.size)


def identity(before_dir, after_dir=None, out=None):
    """Prove the chief's EXISTING frames did not change: decode every frame of the old
    char_player atlas and the new one (both palette PNGs) and compare pixels."""
    import numpy as np
    after_dir = after_dir or os.path.join(ASSETS, 'characters')
    old = Atlas(os.path.join(before_dir, 'char_player.png'), os.path.join(before_dir, 'char_player.json'))
    new = Atlas(os.path.join(after_dir, 'char_player.png'), os.path.join(after_dir, 'char_player.json'))
    names = sorted(old.frames)
    worst, total, exact = 0, 0.0, 0
    per = []
    for nm in names:
        if not new.has(nm):
            print('MISSING in new atlas:', nm)
            continue
        a = np.asarray(old.get(nm)).astype(np.int16)
        b = np.asarray(new.get(nm)).astype(np.int16)
        d = np.abs(a - b)
        m = int(d.max())
        worst = max(worst, m)
        total += float(d.mean())
        exact += int(m == 0)
        per.append((m, float(d.mean()), nm))
    added = sorted(set(new.frames) - set(old.frames))
    print(f'existing chief frames compared: {len(per)} | pixel-identical: {exact} | '
          f'worst max |diff| {worst}/255 | mean |diff| {total / max(1, len(per)):.4f}')
    print(f'new frames: {len(added)} ({", ".join(sorted({n.rsplit("_", 2)[0] for n in added}))})')
    per.sort(reverse=True)
    if out:
        pick = [n for _, _, n in per[:4]] + ['idle_S_0', 'chop_E_5', 'harvest_SE_3', 'carry_walk_N_6']
        z = 3
        sheet = Image.new('RGBA', (3 * 128 * z, len(pick) * 128 * z + 20), BG)
        d = ImageDraw.Draw(sheet)
        d.text((6, 4), 'old atlas | new atlas | |diff| x8  (worst frames first)', fill=LABEL)
        for r, nm in enumerate(pick):
            a, b = old.get(nm), new.get(nm)
            diff = np.clip(np.abs(np.asarray(a).astype(int) - np.asarray(b).astype(int))[..., :3].max(-1) * 8, 0, 255)
            dimg = Image.fromarray(diff.astype(np.uint8), 'L').convert('RGBA')
            for c, im in enumerate((a, b, dimg)):
                sheet.alpha_composite(im.resize((128 * z, 128 * z), Image.NEAREST), (c * 128 * z, 20 + r * 128 * z))
            d.text((6, 24 + r * 128 * z), nm, fill=LABEL)
        sheet.convert('RGB').save(out, optimize=True)
        print('wrote', out)
    return worst


def main():
    a = sys.argv[1:]
    opt = {'cache': '/tmp/fv_cache/characters', 'out': os.path.join(PREV, 'char_player_newanims.gif')}
    i = 0
    mode = None
    while i < len(a):
        if a[i] in ('--newanims', '--identity'):
            mode = a[i][2:]
            i += 1
            continue
        opt[a[i].lstrip('-')] = a[i + 1]
        i += 2
    if mode == 'newanims':
        newanims(opt['cache'], opt['out'], opt['out'].replace('.gif', '.png'))
    elif mode == 'identity':
        identity(opt['before'], opt.get('after'), opt.get('sheet'))


if __name__ == '__main__':
    main()
