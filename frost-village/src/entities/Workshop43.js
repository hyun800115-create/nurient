// (v4.3 「마을 새 단장」, docs/redesign_v43/engineering_plan.md §4.4) 옷·신발 공방 — the bench as a small workshop.
//
// The backpack / boots bench (world.js WORLD.bench, opened after BENCH_AFTER) is dressed as a little workshop: its own picture
// (assets/deck43 `workshop43`, a lean-to with a work table, a boot last, a sewing corner and a blank signboard) whose name the
// GAME writes on the board (strings.js sign_workshop43 = 옷·신발 공방), sheared like the board face (signQuad, as the stall's
// sign). Pads, prices and BENCH_AFTER are unchanged: the name and the look only. While its picture is missing the old bench
// shows with a small hanging board.

import { Assets } from '../core/Assets.js';
import { t } from '../data/strings.js';

export class Workshop43 {
  constructor(gs, cfg) {
    this.gs = gs; this.cfg = cfg;
    this.x = cfg.x; this.y = cfg.y;
    this.key = cfg.spriteOld ? Assets.pick(cfg.sprite, cfg.spriteOld) : cfg.sprite;
    // (a static picture: its collider, occluder and the Culler as every building of the plaza)
    this.img = gs.staticImage(this.key, this.x, this.y, { r: this.key === cfg.sprite ? 74 : undefined });
    this.sign = null;
    this.makeSign();
    // its lantern: a night light (DayClock, Neighbours.attach)
    const fl = Assets.def(this.key).fxPoints;
    if (fl && fl.lantern) (gs.lights43 || (gs.lights43 = [])).push({ x: this.x + fl.lantern[0], y: this.y + fl.lantern[1], k: 0.7 });
  }

  /** the workshop's name on its board: sheared onto the art's blank signboard, or a small hanging board on the old bench */
  makeSign() {
    const gs = this.gs, d = Assets.def(this.key), q = d && d.signQuad, txt = t('sign_workshop43') || '';
    if (this.sign) { this.sign.destroy(); this.sign = null; }
    const vis = this.img.visible;
    if (Array.isArray(q) && q.length >= 4) {
      const w = Math.max(8, q[1][0] - q[0][0]), h = Math.max(8, q[3][1] - q[0][1]), sh = (q[1][1] - q[0][1]) / w;
      const S = 3, key = 'fv_sign_ws43_' + txt;
      if (!gs.textures.exists(key)) {
        const c = gs.textures.createCanvas(key, Math.ceil(w * S), Math.ceil((h + w * Math.abs(sh)) * S) + 2);
        if (c) {
          const ctx = c.context, font = (px) => '900 ' + px + 'px ' + (gs.font || 'sans-serif');
          ctx.setTransform(S, S * sh, 0, S, 0, sh < 0 ? -S * sh * w : 0);
          let fs = Math.round(h * 0.7);
          ctx.font = font(fs);
          while (fs > 6 && ctx.measureText(txt).width > w - 6) { fs--; ctx.font = font(fs); }
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillStyle = 'rgba(255, 248, 230, 0.55)'; ctx.fillText(txt, w / 2, h / 2 + 1.4);
          ctx.fillStyle = d.signColor || '#5A3418'; ctx.fillText(txt, w / 2, h / 2);
          c.refresh();
        }
      }
      if (gs.textures.exists(key)) {
        const ox = this.x + q[0][0], oy = this.y + q[0][1] - (sh < 0 ? -sh * w : 0);
        this.sign = gs.add.image(ox, oy, key).setOrigin(0, 0).setScale(1 / S).setDepth(this.y + 0.5);
      }
    } else {
      // the old bench: a small board on a post beside it
      const c = gs.add.container(this.x - 70, this.y - 112).setDepth(this.y + 0.5);
      const tx = gs.add.text(0, 0, txt, { fontFamily: gs.font, fontSize: '15px', fontStyle: '900', color: '#5a3418', resolution: 2 }).setOrigin(0.5);
      const w = Math.max(60, tx.width + 18);
      const g = gs.add.graphics();
      g.fillStyle(0x6b4a33, 1).fillRect(-2, 12, 4, 40);
      g.fillStyle(0x7d5233, 1).fillRoundedRect(-w / 2 - 2, -14, w + 4, 28, 6);
      g.fillStyle(0xe9d3a6, 1).fillRoundedRect(-w / 2, -12, w, 24, 5);
      c.add([g, tx]);
      this.sign = c;
    }
    if (this.sign) this.sign.setVisible(vis);
  }

  refreshSign() { this.makeSign(); }

  setVisible(v) {
    this.img.setVisible(v);
    if (this.img.__ob) this.img.__ob.active = v;
    if (this.sign) this.sign.setVisible(v);
  }
}
