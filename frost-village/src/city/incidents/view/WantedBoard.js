// 현상수배 게시판 — the wanted board beside the plaza's mission board (civic `wanted_board`, 3 portrait windows).
// A poster shows the culprit's face, rendered once from the doll's layers into a 64 px texture (head and shoulders),
// or the unknown-culprit silhouette (fx_city `ui_wanted_silhouette`) while nobody knows who it was (the chief's E12
// mission or a tip flips it to the face). A neighbour stops to read it (think). A tap opens the big poster
// (fx_city `ui_wanted_poster`: 현상수배 · portrait · 누굴까요? · 보상) on the UI layer; any tap closes it.

import { put, sdef, has, DEPTH, Assets } from './art.js';
import { WANTED_BOARD } from '../layout.js';
import { FONT } from '../../../data/strings.js';

export class WantedBoard {
  constructor(view) {
    this.view = view;
    this.scene = view.scene;
    this.objs = [];
    this.posters = [];        // per slot: { img, key, anon }
    this.list = [];
    this.portraits = new Map();
    this.shown = false;
  }

  sync(list) { this.list = list || []; if (this.shown) this.drawPosters(); }

  show() {
    const S = this.scene, B = WANTED_BOARD;
    this.shown = true;
    this.board = put(S, 'wanted_board', B.x, B.y);
    if (this.board) this.objs.push(this.board);
    this.drawPosters();
  }

  hide() {
    this.shown = false;
    for (const o of this.objs) o.destroy();
    for (const p of this.posters) if (p && p.img) p.img.destroy();
    this.objs = []; this.posters = [];
    if (this.reader) { this.view.cast.remove(this.reader); this.reader = null; }
  }

  /** a 128 px head-and-shoulders portrait of a look, rendered once (the doll's layers drawn into a DynamicTexture;
   *  the game's DollSprite can offer its own `dolls.portrait(look, px)`) */
  portrait(look, key) {
    if (this.portraits.has(key)) return this.portraits.get(key);
    const S = this.scene, P = this.view.ports, N = 128;
    let tk = null;
    if (P.dolls && P.dolls.portrait) tk = P.dolls.portrait(look, N);
    else if (P.dolls && S.textures.addDynamicTexture) {
      const rig = P.dolls.make(look);
      rig.play('idle', 'S');
      rig.place(-9000, -9000, 0, 1);
      const layers = rig.layers ? rig.layers() : [];
      if (layers.length) {
        tk = 'inc_portrait_' + key;
        const dt = S.textures.exists(tk) ? S.textures.get(tk) : S.textures.addDynamicTexture(tk, N, N);
        dt.clear();
        // the drawn head sits at ~0.59 x headTop above the feet: frame it from just above the hat to the chest
        const kid = rig.headTop && rig.headTop > -110;
        const s = (N / 64) * 0.95, ax = N / 2, ay = (N / 64) * (kid ? 62 : 74);
        for (const im of layers) {
          const ox = im.x, oy = im.y, sx = im.scaleX, sy = im.scaleY;
          im.setPosition(ax + (ox + 9000) * s, ay + (oy + 9000) * s).setScale(sx * s, sy * s);
          dt.draw(im);
          im.setPosition(ox, oy).setScale(sx, sy);
        }
      }
      rig.release();
    }
    this.portraits.set(key, tk);
    return tk;
  }

  drawPosters() {
    for (const p of this.posters) if (p && p.img) p.img.destroy();
    this.posters = [];
    const S = this.scene, B = WANTED_BOARD, d = sdef('wanted_board') || {};
    const pts = d.posterPoints || [[-56, -65], [0, -65], [56, -65]];
    const size = d.posterSizePx || [42, 35];
    for (const w of this.list) {
      const p = pts[w.slot] || pts[0];
      const key = w.anon || !w.pid ? 'ui_wanted_silhouette' : this.portrait(this.view.lookOf(w.pid, 'culprit', w.inc), w.pid);
      if (!key || !(has(key) || S.textures.exists(key))) continue;
      const img = S.textures.exists(key) && !has(key) ? S.add.image(B.x + p[0], B.y + p[1], key) : Assets.image(S, B.x + p[0], B.y + p[1], key);
      img.setOrigin(0.5, 0.5);
      const fw = img.frame.realWidth || img.width, fh = img.frame.realHeight || img.height;
      const k = Math.min(size[0] / fw, size[1] / fh) * 1.05;
      img.setScale(k).setDepth(B.y + 0.5);
      this.posters[w.slot] = { img, key, anon: w.anon };
    }
    // a neighbour reads the posters
    if (this.list.length && !this.reader) {
      const gp = (d.gatherPoints && d.gatherPoints[1]) || [0, 32];
      this.reader = this.view.cast.add({ seed: 4242 }, B.x + gp[0] + 6, B.y + gp[1] + 20, 'N');
      this.reader.play('think', 'NE', 'thinking');
    } else if (!this.list.length && this.reader) { this.view.cast.remove(this.reader); this.reader = null; }
  }

  /** a poster just went up: a little pop */
  pop(slot) { const p = this.posters[slot]; if (p && p.img) { const s = p.img.scale; p.img.setScale(s * 0.2); this.scene.tweens.add({ targets: p.img, scale: s, duration: 420, ease: 'Back.easeOut' }); this.view.burst(p.img.x, p.img.y, 'sparkle'); } }

  hit(x, y) { const B = WANTED_BOARD; return Math.abs(x - B.x) < 110 && y < B.y + 20 && y > B.y - 170; }

  /** the big poster on the UI layer (non-pausing; any tap closes it) */
  open(slot) {
    const V = this.view, P = V.ports;
    const U = P.ui && P.ui.scene ? P.ui.scene() : null;
    const w = this.list.find((x) => x.slot === slot) || this.list[0];
    if (!U || !w || !has('ui_wanted_poster')) return null;
    this.close();
    const lang = V.lang();
    const W = U.W || 720, H = U.H || 1280;
    const c = U.add.container(W / 2, H * 0.44).setDepth(DEPTH.TOP);
    const k = Math.min(2.2, (W * 0.68) / 224);   // ~68 % of the phone's width
    const bg = Assets.image(U, 0, 0, 'ui_wanted_poster').setOrigin(0.5, 0.5).setScale(k);
    const ox = -112 * k, oy = -148 * k;
    const box = (r) => ({ x: ox + (r[0] + r[2] / 2) * k, y: oy + (r[1] + r[3] / 2) * k });
    const T = (txt, r, size, color) => { const p = box(r); return U.add.text(p.x, p.y, txt, { fontFamily: FONT, fontSize: size + 'px', fontStyle: '900', color: color || '#4a2a14', resolution: 2 }).setOrigin(0.5); };
    const pk = w.anon || !w.pid ? 'ui_wanted_silhouette' : this.portrait(V.lookOf(w.pid, 'culprit', w.inc), w.pid);
    const pp = box([48, 78, 128, 128]);
    const por = pk ? (has(pk) ? Assets.image(U, pp.x, pp.y, pk) : U.add.image(pp.x, pp.y, pk)) : null;
    if (por) { por.setOrigin(0.5); por.setScale((128 * k) / Math.max(por.frame.realWidth || por.width, 1)); }
    const who = w.anon || !w.pid ? V.text('wantedWho') : (P.people && P.people.name ? P.people.name(w.pid, lang) : V.text('wantedWho'));
    const items = [bg, por, T(V.text('wanted'), [40, 22, 144, 36], Math.round(26 * k), '#b0281e'), T(who, [40, 224, 144, 26], Math.round(17 * k)), T(V.text('wantedReward', { n: w.reward }), [82, 256, 104, 26], Math.round(14 * k), '#6a4a10')];
    if (has('ui_icon_coin')) { const ci = box([52, 262, 24, 24]); items.push(Assets.image(U, ci.x, ci.y, 'ui_icon_coin').setScale(0.25 * k)); }
    c.add(items.filter(Boolean));
    c.setScale(0.6); U.tweens.add({ targets: c, scale: 1, duration: 320, ease: 'Back.easeOut' });
    this.panel = c;
    V.sound('sfx_newspaper', 0, 0, 0.5);
    return c;
  }
  close() { if (this.panel) { this.panel.destroy(); this.panel = null; } }

  destroy() { this.close(); this.hide(); }
}
