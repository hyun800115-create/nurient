// Art helpers for the beach view (Phaser only; the finished atlases through the game's Assets registry).
// Everything here reads the manifests as they are: anchors, frames, anims (spr:<key>:<anim>), characters
// (<key>:<anim>:<dir>, mirrored dirs flipX), spritesheets (fx). Missing art is never replaced by a placeholder:
// the thing is simply not drawn until its atlas is there (art.has()).

import { Assets } from '../../core/Assets.js';

export const MIRROR = { SW: 'SE', W: 'E', NW: 'NE' };

export const art = {
  has(key) { try { return !!Assets.game && Assets.has(key); } catch (e) { return false; } },
  def(key) { return Assets.def(key) || {}; },
  /** an Image of sprite `key` at (x, y), origin = its anchor (null when the atlas is not loaded) */
  image(scene, key, x, y) {
    if (!this.has(key)) return null;
    return Assets.image(scene, x, y, key);
  },
  /** a Sprite (it can play the manifest's loops) of sprite `key` */
  sprite(scene, key, x, y) {
    if (!this.has(key)) return null;
    const r = Assets.sprite(key);
    const s = scene.add.sprite(x, y, r.tex, r.frame);
    s.setOrigin(r.anchor[0], r.anchor[1]);
    return s;
  },
  /** a Sprite when the sprite has anims, else an Image */
  make(scene, key, x, y) { const d = this.def(key); return d && d.anims ? this.sprite(scene, key, x, y) : this.image(scene, key, x, y); },
  /** set an existing Image to sprite `key` */
  apply(img, key) { if (this.has(key)) Assets.apply(img, key); return img; },
  /** play a sprite's named loop (flutter / sway / bob / bell …); sync = same frame on every copy (buoy lines) */
  loop(img, key, anim, opts = {}) {
    const k = Assets.spriteAnim(key, anim) || (Assets.spriteAnims(Assets.game, key), Assets.spriteAnim(key, anim));
    if (!k || !img.play) return false;
    img.play({ key: k, startFrame: opts.start || 0 });
    if (opts.rate) img.anims.timeScale = opts.rate;
    return true;
  },
  sheetDef(key) { return Assets.sheetDef(key); },
  sheet(scene, key) { if (!scene.textures.exists(key)) return null; Assets.sheetAnims(Assets.game, key); return Assets.sheet(key); },
  /** character anim key for (key, anim, dir) with mirroring: { anim, flip } (null if not built) */
  charAnim(key, anim, dir) {
    const def = Assets.charDef(key);
    if (!def || !def.atlas || !Assets.texOf(def.atlas)) return null;
    if (!Assets.built[key] || !(def._dirs && def._dirs[anim])) Assets.buildCharacter(Assets.game, key);
    let d = dir, flip = false;
    const dirs = (def._dirs && def._dirs[anim]) || [];
    if (!dirs.includes(d) && MIRROR[d] && dirs.includes(MIRROR[d])) { d = MIRROR[d]; flip = true; }
    if (!dirs.includes(d) && def.nearest && def.nearest[dir]) { const n = def.nearest[dir]; if (dirs.includes(n)) d = n; else if (MIRROR[n] && dirs.includes(MIRROR[n])) { d = MIRROR[n]; flip = true; } }
    if (!dirs.includes(d)) d = dirs[0];
    if (!d) return null;
    return { key: key + ':' + anim + ':' + d, dir: d, flip, def };
  },
  charDef(key) { return Assets.charDef(key); },
  /** a soft ground shadow texture (made once) */
  shadowTex(scene) {
    if (scene.textures.exists('bch_shadow')) return 'bch_shadow';
    const w = 64, h = 32, c = scene.textures.createCanvas('bch_shadow', w, h);
    const g = c.context, gr = g.createRadialGradient(w / 2, h / 2, 1, w / 2, h / 2, w / 2);
    gr.addColorStop(0, 'rgba(40,60,90,0.42)'); gr.addColorStop(0.55, 'rgba(40,60,90,0.22)'); gr.addColorStop(1, 'rgba(40,60,90,0)');
    g.save(); g.scale(1, h / w); g.fillStyle = gr; g.beginPath(); g.arc(w / 2, w / 2, w / 2, 0, Math.PI * 2); g.fill(); g.restore();
    c.refresh();
    return 'bch_shadow';
  },
  /** a soft round glow (ADD) for fireworks and lamps */
  glowTex(scene) {
    if (scene.textures.exists('bch_glow')) return 'bch_glow';
    const s = 64, c = scene.textures.createCanvas('bch_glow', s, s), g = c.context;
    const gr = g.createRadialGradient(s / 2, s / 2, 1, s / 2, s / 2, s / 2);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,255,255,0.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, s, s); c.refresh();
    return 'bch_glow';
  },
  /** a 1 px white dot texture for ropes / strings drawn as stretched images */
  dotTex(scene) {
    if (scene.textures.exists('bch_dot')) return 'bch_dot';
    const c = scene.textures.createCanvas('bch_dot', 4, 4); c.context.fillStyle = '#fff'; c.context.fillRect(0, 0, 4, 4); c.refresh();
    return 'bch_dot';
  },
  /** the source of a sprite frame for canvas baking: { img, sx, sy, sw, sh, ox, oy } (offsets from the anchor) */
  frameSource(key) {
    if (!this.has(key)) return null;
    const s = Assets.source(key);
    const fr = s.frame;
    if (!fr || s.ph) return null;
    const def = s.def || {};
    const fw = fr.realWidth, fh = fr.realHeight;
    const ax = (def.anchorPx ? def.anchorPx[0] : s.anchor[0] * fw), ay = (def.anchorPx ? def.anchorPx[1] : s.anchor[1] * fh);
    return { img: s.img, sx: fr.cutX, sy: fr.cutY, sw: fr.cutWidth, sh: fr.cutHeight, ox: (fr.x || 0) - ax, oy: (fr.y || 0) - ay };
  },
};
