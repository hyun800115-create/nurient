"""
ch2_pack.py - pack the v4.2 chief anims (CONTRACT_V42 AH) into assets/chief2.

Run AFTER ch2_render.py (plain python3 + numpy + Pillow + imagequant, no Blender):
    python3 tools/blender/ch2_pack.py [--cache /tmp/fv_cache/chief2]

  1. every raw 128 x 128 frame gets the characters' soft 1 px ink outline (char_pack.ink_outline, imported -
     never edited - so the new frames are post-processed exactly like char_player)
  2. one trimmed atlas assets/chief2/char_player_b.png/.json (Phaser JSON hash, pack_utils.pack_atlas; the
     sheet width is chosen to minimise the RGBA source-sum; 256-colour imagequant palette like char_player)
  3. assets/chief2/manifest.json: characters.player_b = { extends: "player", atlas: "char_player_b", anims }
     (+ headTop / headTopSit / seat block / sit_write impactPoint)

Polish (docs/build_reports/v42_chief2_critique.md):
  * M2  sit_read_in (frames 0-1, repeat 0) and sit_read_loop (frames 2-5, loop) ship as ALIAS anims: their frame
        names point at the very same atlas rectangles as sit_read_0..5 (no extra texture), so the stock
        Assets.buildCharacter builds a seam-free reading loop with no new code.
  * L3  pacing hints: anims.cheer.repeatDelay (hold the last frame between hops), anims.doze.frameHold (the deepest
        nod lingers) - Phaser anim config `repeatDelay` and per-frame `duration`.
  * L4  per-anim headTop where an anim's head rises above the player's -81 (talk, wave, cheer) + cheer propTop.
  * L5  the `_desk` overlays keep only what lies on the desk side of the desk's near-edge line on screen (2 px
        margin): above that line nothing of the desk can cover him, so the overlay no longer doubles his soft
        outline there.

Files: 3 (contract AH budget).  Nothing outside assets/chief2 is written (previews: ch2_preview.py).
"""
import json
import math
import os
import sys

import numpy as np
from PIL import Image, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
TOOLS = os.path.dirname(HERE)
GAME = os.path.dirname(TOOLS)
sys.path.insert(0, HERE)
sys.path.insert(0, TOOLS)
import pack_utils          # noqa: E402
import char_pack           # noqa: E402  (ink_outline - imported, never edited)
import ch2_anim as ca      # noqa: E402

try:
    import imagequant
except ImportError:        # pragma: no cover
    imagequant = None

OUT = os.path.join(GAME, 'assets', 'chief2')
DEFAULT_CACHE = '/tmp/fv_cache/chief2'
KEY = 'player_b'
ATLAS = 'char_player_b'
ANCHOR = (64, 104)
PLAYER_HEADTOP = -81          # assets/characters manifest player.headTop (standing; unchanged)
DIR_YAW = {'S': 45.0, 'SE': 90.0, 'E': 135.0}
OVERLAY_MARGIN = 2.0          # px the overlay may reach past the desk's near-edge line toward him (L5)
# alias anims (polish M2): name -> (source anim, first source frame, frames, repeat, next)
ALIASES = {'sit_read_in': ('sit_read', 0, 2, 0, 'sit_read_loop'),
           'sit_read_loop': ('sit_read', 2, 4, -1, None)}
# pacing hints (polish L3), ms: Phaser anim config `repeatDelay` / per-frame `duration`
PACING = {'cheer': {'repeatDelay': 600}, 'doze': {'frameHold': {'2': 1600}}}


def load_frames(cache):
    meta_p = os.path.join(cache, KEY, 'meta.json')
    if not os.path.exists(meta_p):
        raise SystemExit(f'ch2_pack: no {meta_p} - run ch2_render.py first / 먼저 ch2_render.py 를 실행하세요')
    with open(meta_p) as f:
        meta = json.load(f)
    frames, missing = [], []
    for an in ca.ORDER:
        info = meta['anims'][an]
        for d in info['dirs']:
            for i in range(info['frames']):
                p = os.path.join(cache, KEY, f'{an}_{d}_{i}.png')
                if not os.path.exists(p):
                    missing.append(os.path.basename(p))
                    continue
                full = char_pack.ink_outline(Image.open(p))
                frames.append((f'{an}_{d}_{i}', full))
                if an in ca.DESK_OVERLAY:
                    mp = p[:-4] + '_mask.png'
                    if not os.path.exists(mp):
                        missing.append(os.path.basename(mp))
                        continue
                    side = desk_side(d, meta['seat']['deskEdgePoint'][d])
                    frames.append((f'{an}_{d}_{i}_desk', desk_overlay(full, Image.open(mp), side)))
    if missing:
        raise SystemExit(f'ch2_pack: {len(missing)} frames missing, e.g. {missing[:4]} - nothing written')
    return meta, frames


def proj(p, yaw_deg):
    """Root-local vector (m) -> image px (dx, dy), y down (bl_common camera: yaw 45, elevation 30, PPU 64)."""
    x, y, z = p
    a = math.radians(yaw_deg)
    wx, wy = x * math.cos(a) - y * math.sin(a), x * math.sin(a) + y * math.cos(a)
    c45 = math.cos(math.radians(45))
    return ((wx + wy) * c45 * 64, -((-wx + wy) * c45 * 0.5 + z * math.cos(math.radians(30))) * 64)


def desk_side(d, edge):
    """(polish L5) per-pixel weight 1 on the DESK side of the desk's near-edge line on screen (the line through
    seat.deskEdgePoint along his left-right axis), fading to 0 OVERLAY_MARGIN px past it toward him.  Anything of
    him beyond that line is above the desk top in 3D and never under the desk art, so the overlay must not draw it
    a second time (that doubled the soft outline of raised mittens)."""
    tx, ty = proj((1, 0, 0), DIR_YAW[d])
    fx, fy = proj((0, -1, 0), DIR_YAW[d])                 # forward = toward the desk
    tl = math.hypot(tx, ty)
    tx, ty = tx / tl, ty / tl
    nx, ny = fx - (fx * tx + fy * ty) * tx, fy - (fx * tx + fy * ty) * ty
    nl = math.hypot(nx, ny)
    nx, ny = nx / nl, ny / nl
    ex, ey = ANCHOR[0] + edge[0], ANCHOR[1] + edge[1]
    yy, xx = np.mgrid[0:128, 0:128].astype(np.float32)
    dist = (xx + 0.5 - ex) * nx + (yy + 0.5 - ey) * ny     # > 0 on the desk side
    return np.clip(dist + OVERLAY_MARGIN + 0.5, 0.0, 1.0)


def desk_overlay(full, mask_im, side=None):
    """The part of an (outlined) seated frame that lies ON the desk: hands, forearms and props in front of the
    desk's near edge and above its top (the Blender mask pass), grown 1 px so the ink outline comes along, and
    (L5) only on the desk side of the desk's near-edge line on screen."""
    m = np.asarray(mask_im.convert('RGBA')).astype(np.float32) / 255.0
    val = m[..., 0] * (m[..., 3] > 0)
    val = np.clip((val - 0.03) / 0.94, 0.0, 1.0)          # drop the 8-bit dither noise of the black areas
    grown = np.asarray(Image.fromarray((val * 255).astype(np.uint8), 'L').filter(ImageFilter.MaxFilter(3)),
                       np.float32) / 255.0
    if side is not None:
        grown = grown * side
    a = np.asarray(full).copy()
    a[..., 3] = (a[..., 3].astype(np.float32) * grown + 0.5).astype(np.uint8)
    a[a[..., 3] == 0] = 0
    return Image.fromarray(a, 'RGBA')


def best_pack(frames):
    best = None
    for w in range(512, 2049, 32):
        try:
            sheet, atlas = pack_utils.pack_atlas(frames, max_width=w, trim=True, padding=2)
        except ValueError:
            continue
        area = sheet.size[0] * sheet.size[1]
        if best is None or area < best[0]:
            best = (area, sheet, atlas)
    return best[1], best[2]


def head_top(im):
    bb = im.getchannel('A').getbbox()
    return bb[1] - ANCHOR[1]


def main():
    args = sys.argv[1:]
    cache = args[args.index('--cache') + 1] if '--cache' in args else DEFAULT_CACHE
    meta, frames = load_frames(cache)
    byname = dict(frames)
    sheet, atlas = best_pack(frames)
    # (M2) alias frames: same rectangles as their source frames - no extra texture
    for al, (src, first, n, _rep, _nxt) in ALIASES.items():
        for d in ca.DIRS:
            for i in range(n):
                for suf in (('', '_desk') if src in ca.DESK_OVERLAY else ('',)):
                    atlas['frames'][f'{al}_{d}_{i}{suf}'] = dict(atlas['frames'][f'{src}_{d}_{first + i}{suf}'])
    os.makedirs(OUT, exist_ok=True)
    png = os.path.join(OUT, ATLAS + '.png')
    js = os.path.join(OUT, ATLAS + '.json')
    pack_utils.save_atlas(sheet, atlas, png, js, quantize=False)
    if imagequant is not None:
        q = imagequant.quantize_pil_image(sheet, dithering_level=0.6, max_quality=100, min_quality=0, max_colors=256)
        q.save(png, optimize=True)
    w, h = sheet.size
    mib = w * h * 4 / 1048576

    # head tops (px from the anchor): standing = the player's -81 (talk / wave frames are measured and must
    # agree within 2 px); seated = the highest head pixel of sit_idle S over its frames (bubbles go above it)
    stand_top = min(head_top(byname[f'talk_S_{i}']) for i in range(ca.ANIMS['talk']['frames']))
    sit_top = min(head_top(byname[f'sit_idle_S_{i}']) for i in range(ca.ANIMS['sit_idle']['frames']))
    # (L4) per-anim head tops for the standing anims whose head rises above the player's -81: the HEAD's top
    # (the cheer pennant excluded) = the top of the dark hair in the raw render + the hair-highlight / ink offset
    # calibrated on talk, where the frame top IS the head top; cheer also gets propTop = the pennant's top
    def dark_top(an, d, i):
        a = np.asarray(Image.open(os.path.join(cache, KEY, f'{an}_{d}_{i}.png')).convert('RGBA')).astype(int)
        m = (a[..., 3] > 200) & (a[..., :3].max(-1) < 85)
        return int(np.where(m.any(1))[0][0]) - ANCHOR[1]
    cal = sorted(head_top(byname[f'talk_{d}_{i}']) - dark_top('talk', d, i)
                 for d in ca.DIRS for i in range(ca.ANIMS['talk']['frames']))
    cal = cal[len(cal) // 2]
    anim_top, prop_top = {}, {}
    for an in ('talk', 'wave', 'warm_hands', 'cheer'):
        t = min(dark_top(an, d, i) for d in ca.DIRS for i in range(ca.ANIMS[an]['frames'])) + cal
        if an == 'talk':
            t = min(t, stand_top)
        if t < PLAYER_HEADTOP:
            anim_top[an] = t
    prop_top['cheer'] = min(head_top(byname[f'cheer_{d}_{i}']) for d in ca.DIRS for i in range(6))
    anims = {}
    for an in ca.ORDER:
        src = meta['anims'][an]
        e = {'frames': src['frames'], 'fps': src['fps'], 'repeat': src['repeat'], 'dirs': src['dirs'],
             'atlas': ATLAS}
        if src.get('seated'):
            e['seated'] = True
        if 'loopFrom' in src:
            e['loopFrom'] = src['loopFrom']
        if an in ca.DESK_OVERLAY:
            e['deskOverlay'] = True
        if 'impactFrame' in src:
            e['impactFrame'] = src['impactFrame']
            e['impactPoint'] = src['impactPoint']
        if an in anim_top:
            e['headTop'] = anim_top[an]
        if an in prop_top:
            e['propTop'] = prop_top[an]
        if an == 'cheer':
            e['prop'] = 'pennant'
        if an == 'sit_read':
            e['playAs'] = ['sit_read_in', 'sit_read_loop']
        if an == 'doze':
            e['placeAt'] = 'a SEAT point only (office chiefDeskPoint = the desk chair, bench / log seatPoints); never ' \
                           'office stovePoint (a standing ground point with no seat: he would float)'
        e.update(PACING.get(an, {}))
        anims[an] = e
        if an == 'sit_read':
            for al, (s_an, first, n, rep, nxt) in ALIASES.items():
                a2 = {'frames': n, 'fps': src['fps'], 'repeat': rep, 'dirs': src['dirs'], 'atlas': ATLAS,
                      'seated': True, 'aliasOf': {'anim': s_an, 'from': first}}
                if an in ca.DESK_OVERLAY:
                    a2['deskOverlay'] = True
                if nxt:
                    a2['next'] = nxt
                anims[al] = a2
    seat = meta['seat']
    entry = {
        'extends': 'player', 'atlas': ATLAS,
        'frameSize': [128, 128], 'anchor': [ANCHOR[0] / 128, ANCHOR[1] / 128],
        'dirs': list(ca.DIRS), 'mirror': {'SW': 'SE', 'W': 'E'}, 'frameName': '{anim}_{dir}_{i}',
        'kind': 'human', 'headTop': PLAYER_HEADTOP, 'headTopSit': sit_top,
        'seat': {'heightM': seat['heightM'], 'deskTopM': seat['deskTopM'], 'deskEdgeM': seat['deskEdgeM'],
                 'hipBackM': seat['hipBackM'], 'floorBelowPx': seat['floorBelowPx'],
                 'deskEdgePoint': seat['deskEdgePoint']},
        'deskOverlay': {'suffix': '_desk', 'anims': list(ca.DESK_OVERLAY) + list(ALIASES),
                        'zone': 'surface points in front of the desk near edge (y < -0.10 m) and 0.002-0.31 m above '
                                'the desk top: forearms, mittens, quill, stamp, paper, bowl, spoon',
                        'depthHint': 'draw `{anim}_{dir}_{i}_desk` at the chief\'s position right ABOVE the desk / '
                                     'table art (office: depthOffset -0.095, just over chief_office_interior_front '
                                     '-0.10), same frame index, same flipX; the full frame stays in @behind.'},
        'anims': anims,
    }
    man = {
        'version': 1,
        'generator': 'tools/blender/ch2_render.py + ch2_pack.py (docs/CONTRACT_V42.md section AH)',
        'conventions': {
            'ppu': 64,
            'extends': 'characters.player_b EXTENDS characters.player (assets/characters): merge its anims into '
                       'the player definition (each anim names its own atlas `char_player_b`); every other field of '
                       'the player (carryPoint, petPoint, shadow, portrait, the old anims) stays as it is.  '
                       'Stand-alone it is also a complete character def (frameSize, anchor, dirs, mirror, frameName).',
            'rig': 'Rendered with the player rig itself (char_build.build("player"): white fur parka, brown belt + '
                   'satchel, boots, hair), bl_common camera / light / PPU 64, char_render scene settings and the '
                   'char_pack 1 px ink outline: same scale, look and outline as char_player.  char_player is not '
                   'touched.',
            'frames': '128 x 128, anchor [0.5, 0.8125] = px (64, 104); names {anim}_{dir}_{i}; rendered dirs S, SE, '
                      'E (anims[*].dirs), mirrors SW <- SE, W <- E with flipX (negate dx of every point).  NE / N do '
                      'not exist: the game turns him to the nearest rendered dir.',
            'standing': 'talk, wave, warm_hands, cheer: anchor = the ground under his feet (as player); headTop -81.',
            'seated': 'sit_idle, sit_write, sit_read, sit_eat, doze (anims[*].seated): anchor = the SEAT POINT = '
                      'the seat surface front-centre of a 0.45 m chair (townfolk2 sit / officefolk / office '
                      'chiefDeskPoint / life2 seatPoints convention); place the sprite AT the seat point (it already '
                      'includes the seat height).  No chair or desk is drawn.  The desk / table top is 0.72 m from '
                      'the floor, its near edge 0.10 m in front of the seat front: mittens, quill, stamp, bowl and '
                      'paper work at that height.  seat.floorBelowPx = the floor is that many px below the seat point (outside the frame on purpose: draw his shadow '
                      'there), seat.deskEdgePoint = the desk-top near-edge centre per dir.  Chibi legs hang toward '
                      'the floor (they cannot reach 0.45 m down, like every seated townsperson); a desk / table front '
                      'drawn over him hides them.  headTopSit = the seated head top (speech bubbles, emote_zzz).',
            'points': 'every *Point value is a px offset [dx, dy] from the anchor (unscaled), per rendered dir.  '
                      'anims.sit_write.impactPoint = the stamp face on the desk at impactFrame 4 (spawn the stamp '
                      'puff + sfx_stamp there).',
            'loopFrom': 'anims.sit_read.loopFrom 2: frames 0-1 (folded paper lifted and shaken open) play ONCE, '
                        'then 2-5 (reading) loop.  Never loop sit_read 0-5 plainly: the paper would snap shut every '
                        'second.  Zero-code way: play `sit_read_in` (repeat 0) and on complete `sit_read_loop` (or '
                        'just `sit_read_loop`) - two ALIAS anims (anims[*].aliasOf) whose frame names point at the same '
                        'atlas rectangles as sit_read 0-1 / 2-5 (and their _desk overlays), so the stock '
                        'Assets.buildCharacter builds them like any anim.',
            'pacing': 'optional hints (ms) for a calmer loop: anims.cheer.repeatDelay 600 = Phaser anim config '
                      'repeatDelay (the pennant-up last frame holds between hops, one hop per 1.2 s instead of '
                      '100 a minute); anims.doze.frameHold {"2": 1600} = Phaser frame `duration` on frame 2 (the '
                      'deepest nod lingers, a nod every ~2.9 s).  Without them the anims still play per contract.',
            'headTop': 'headTop -81 (= player) for every standing anim, except where anims[x].headTop says the head '
                       'rises higher (talk nods, the wave lean, the cheer hop): use the anim value for bubbles / the '
                       'star pin while it plays.  anims.cheer.propTop = the pennant top (it flies beside the head, '
                       'out to his right / ahead).  headTopSit for every seated anim.',
            'faces': 'faces are part of the frames: blink (sit_idle 2, talk 4, sit_read 4, warm_hands 3), sleeping '
                     'eyes (doze), happy squint (sit_eat 3, wave, cheer), open / half-open mouth (talk, cheer).',
            'props': 'props are part of the frames (no extra sprites): teal quill + wooden stamp with a red face '
                     '(sit_write), newspaper cream with grey columns, masthead band and a photo box - no text '
                     '(sit_read), red soup bowl + wooden spoon (sit_eat), a little teal 서리마을 pennant with a cream '
                     'snowflake on a birch stick (cheer: held up in the right fist, the flag flies out above his '
                     'shoulder line - beside the head in S / SE / SW, ahead of him in E / W).  Nothing is carried on '
                     'the head.',
            'office': 'office routine: desk anims at chiefDeskPoint facing chiefDeskDir (SW), band behind, `_desk` '
                      'overlay over chief_office_interior_front.  The 22:00 "doze by the stove": warm_hands standing '
                      'at stovePoint (facing the stove), then doze on the desk chair (chiefDeskPoint) - stovePoint '
                      'has no seat.',
        },
        'atlases': [{'key': ATLAS, 'png': f'chief2/{ATLAS}.png', 'json': f'chief2/{ATLAS}.json'}],
        'characters': {KEY: entry},
    }
    with open(os.path.join(OUT, 'manifest.json'), 'w', encoding='utf-8') as f:
        json.dump(man, f, indent=1, ensure_ascii=False)
    total = sum(os.path.getsize(os.path.join(OUT, n)) for n in os.listdir(OUT))
    print(f'{ATLAS}: {len(frames)} frames, sheet {w}x{h}, RGBA source-sum {mib:.2f} MiB, '
          f'png {os.path.getsize(png) / 1024:.0f} KB; headTop stand {stand_top} (player {PLAYER_HEADTOP}), '
          f'headTopSit {sit_top}; assets/chief2 {total / 1024:.0f} KB in {len(os.listdir(OUT))} files')


if __name__ == '__main__':
    main()
