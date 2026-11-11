// (v4.3 마을 깃발) the title diorama's hero flag pole flies the player's flag too (the stored save's, read-only; the classic
// flag before there is one). Same bare pole + strips as the village (VillageFlags), riding on the diorama record as
// extras (they pop, fade and take the title's light with it); the strips wave at 30 Hz without the cloth shading (the
// title tints its pictures itself).
import { readJSON, SAVE_KEY } from '../core/Save.js';
import { sanitizeFlag, CLASSIC, plain } from './design.js';
import { flagTexture, waveStrips, TEX, TEX_W } from './VillageFlags.js';
import { Assets } from '../core/Assets.js';

const FP = { w: 221, h: 336, base: 82, mastX: 26, mastW: 8, mastY0: 90, mastH: 10, topX: 18, topW: 24, topH: 16, flagTop: 17, poleR: 30 };

/** the village flag in the stored save (classic when there is none / it cannot be read) */
export function storedFlag() {
  let raw = null;
  try { raw = readJSON(SAVE_KEY); } catch (e) { raw = null; }
  const f = raw && typeof raw === 'object' ? sanitizeFlag(raw.flag) : null;
  return f ? plain(f) : plain(CLASSIC);
}

/** dress the diorama record `r` (a live props flag_pole) — false when its picture is not the expected one */
export function dressTitlePole(dio, r) {
  try {
    const s = dio.scene, img = r.img;
    if (!img || !img.frame || img.flipX) return false;
    const p = Assets.sprite('flag_pole');
    if (p.ph || p.pending || img.texture.key !== p.tex) return false;
    const F = img.frame, T = img.texture;
    if (F.rotated || Math.abs(F.cutWidth - FP.w) > 2 || Math.abs(F.cutHeight - FP.h) > 2) return false;
    if (!flagTexture(s.textures, storedFlag())) return false;
    const add = (name, tx, ty, w, h) => { if (!T.has(name)) T.add(name, F.sourceIndex, F.cutX + tx, F.cutY + ty, w, h); return name; };
    const fBase = add('fv_fp_base', 0, FP.base, F.cutWidth, F.cutHeight - FP.base);
    const fMast = add('fv_fp_mast', FP.mastX, FP.mastY0, FP.mastW, FP.mastH);
    const fTop = add('fv_fp_top', FP.topX, 0, FP.topW, FP.topH);
    // offsets from the record's anchor in unscaled px (the extras scale with the pop)
    const ox = F.x - img.displayOriginX, oy = F.y - img.displayOriginY;
    img.setFrame(fBase);
    img.setDisplayOrigin(-ox, -(oy + FP.base));
    dio.addExtra(r, s.add.image(0, 0, T.key, fMast).setOrigin(0, 0).setScale(1, (FP.base + 3 - FP.flagTop) / FP.mastH), ox + FP.mastX, oy + FP.flagTop - 2, 0.0004);
    dio.addExtra(r, s.add.image(0, 0, T.key, fTop).setOrigin(0, 0), ox + FP.topX, oy, 0.0006);
    const n = 12, k = 0.58, fw = TEX_W - 4;
    const strips = [];
    for (let i = 0; i < n; i++) {
      const im = s.add.image(0, 0, TEX, 'w12_' + i).setOrigin(0, 0).setScale(k);
      dio.addExtra(r, im, ox + FP.poleR + ((i * fw) / n) * k, oy + FP.flagTop - 2 * k, -0.01);
      strips.push(r.extras[r.extras.length - 1]);
    }
    for (const e of strips) e.dy0 = e.dy;
    (dio.flagPoles || (dio.flagPoles = [])).push({ r, strips, ph: 0.7, acc: 0, fake: strips.map(() => ({ y: 0, setTint() {} })) });
    return true;
  } catch (e) { return false; }
}

/** the title's flags wave (DioramaTitle.update) */
export function waveTitle(dio, dt) {
  const L = dio.flagPoles;
  if (!L || dio.reduced) return;
  dio.flagT = (dio.flagT || 0) + dt;
  for (const P of L) {
    P.acc += dt;
    if (P.acc < 1 / 30) continue;
    P.acc = 0;
    const r = P.r;
    if (!r.img || !r.img.visible) continue;
    const T = dio.flagT, w = 1 + 0.15 * Math.sin(T * 0.4);
    // the strips' dy (in the record's unscaled px) on the same wave as the village's (no tint: the title lights them)
    const fake = P.fake;
    waveStrips(fake, T, P.ph, 2.4, w, 0, false);
    P.strips.forEach((e, i) => { e.dy = e.dy0 + fake[i].y; });
    dio.syncExtras(r);
  }
}
